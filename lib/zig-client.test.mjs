import assert from 'node:assert/strict'
import test from 'node:test'
import { CHECKIN_PAGE_SIZE, ZIG_BASE_URL, ZigError, createZigClient } from './zig-client.mjs'
import { checkinWindows } from './zig-preview.mjs'

const TOKEN = 'tok-secret-123'
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('envia o token cru no header Authorization, só por GET e só para a base fixa', async () => {
  const calls = []
  const client = createZigClient({ token: ` ${TOKEN} `, fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return json([{ id: '1', name: 'Loja' }]) } })
  await client.listStores('rede-1')
  assert.equal(calls[0].url, `${ZIG_BASE_URL}/erp/lojas?rede=rede-1`)
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.headers.Authorization, TOKEN)
  assert.equal(calls[0].init.redirect, 'error')
})

test('exige token válido', () => {
  assert.throws(() => createZigClient({ token: '' }), (error) => error.code === 'zig_token_missing')
  assert.throws(() => createZigClient({ token: 'a b' }), (error) => error.code === 'zig_token_missing')
  assert.throws(() => createZigClient({ token: 'a\nb' }), (error) => error.code === 'zig_token_missing')
})

test('erros da Zig são compreensíveis e nunca contêm o token', async () => {
  const cases = [
    [401, 'zig_auth'], [403, 'zig_auth'], [400, 'zig_rejected'], [404, 'zig_not_found'], [429, 'zig_rate_limited'], [503, 'zig_unavailable'],
  ]
  const echoes = [`erro ${TOKEN} detalhe`, `token inválido: ${TOKEN.slice(0, 8)}…`, `…${TOKEN.slice(-8)}`, JSON.stringify({ message: `Authorization ${TOKEN}`, error: TOKEN.slice(3, 15) })]
  for (const body of echoes) {
    for (const [status, code] of [...cases, [418, 'zig_error']]) {
      const client = createZigClient({ token: TOKEN, fetchImpl: async () => new Response(body, { status }) })
      await assert.rejects(client.listStores('r'), (error) => {
        assert.equal(error.code, code)
        assert.ok(error instanceof ZigError)
        for (const piece of [TOKEN, TOKEN.slice(0, 8), TOKEN.slice(-8), TOKEN.slice(3, 15)]) assert.ok(!error.message.includes(piece), `vazou ${piece}`)
        assert.ok(!error.message.includes('detalhe'), 'o corpo bruto não deve ser repassado')
        return true
      })
    }
  }
  const network = createZigClient({ token: TOKEN, fetchImpl: async () => { throw new TypeError(`fetch failed ${TOKEN}`) } })
  await assert.rejects(network.listStores('r'), (error) => error.code === 'zig_network' && !error.message.includes(TOKEN))
  const html = createZigClient({ token: TOKEN, fetchImpl: async () => new Response('<html>', { status: 200 }) })
  await assert.rejects(html.listStores('r'), (error) => error.code === 'zig_invalid_response')
  const object = createZigClient({ token: TOKEN, fetchImpl: async () => json({ a: 1 }) })
  await assert.rejects(object.listStores('r'), (error) => error.code === 'zig_invalid_response')
})

test('check-ins: percorre todas as páginas a partir de 1 até uma página curta', async () => {
  const pages = []
  const rows = (count, offset) => Array.from({ length: count }, (_, index) => ({ id: `u${offset + index}`, checkinTime: '2026-10-24T22:00:00' }))
  const client = createZigClient({
    token: TOKEN,
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get('page'))
      pages.push(page)
      return json(page < 3 ? rows(CHECKIN_PAGE_SIZE, page * 100) : rows(7, 300))
    },
  })
  const { items, pages: used } = await client.listCheckins('L1', '2026-10-24', '2026-10-25')
  assert.deepEqual(pages, [1, 2, 3])
  assert.equal(items.length, 107)
  assert.equal(used, 3)
})

test('check-ins: falha em página intermediária descarta o resultado', async () => {
  const client = createZigClient({
    token: TOKEN,
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get('page'))
      if (page === 2) return new Response('x', { status: 500 })
      return json(Array.from({ length: CHECKIN_PAGE_SIZE }, (_, index) => ({ id: `u${index}`, checkinTime: 't' })))
    },
  })
  await assert.rejects(client.listCheckins('L1', '2026-10-24', '2026-10-25'), (error) => error.code === 'zig_unavailable' && /página 2/.test(error.message))
})

test('check-ins: paginação repetida e janela acima de 5 dias são rejeitadas', async () => {
  const same = Array.from({ length: CHECKIN_PAGE_SIZE }, (_, index) => ({ id: `u${index}`, checkinTime: 't' }))
  const loop = createZigClient({ token: TOKEN, fetchImpl: async () => json(same) })
  await assert.rejects(loop.listCheckins('L1', '2026-10-24', '2026-10-25'), (error) => error.code === 'zig_pagination')
  const client = createZigClient({ token: TOKEN, fetchImpl: async () => json([]) })
  await assert.rejects(client.listCheckins('L1', '2026-10-01', '2026-10-07'), (error) => error.code === 'invalid_period')
  await assert.rejects(client.listCheckins('L1', '2026-10-0x', '2026-10-07'), (error) => error.code === 'invalid_period')
  await assert.doesNotReject(client.listCheckins('L1', '2026-10-01', '2026-10-06'))
})

test('janelas de check-in respeitam 5 dias e se sobrepõem em 1 dia', () => {
  assert.deepEqual(checkinWindows('2026-10-20', '2026-10-22'), [{ desde: '2026-10-20', dtfim: '2026-10-22' }])
  const windows = checkinWindows('2026-10-01', '2026-10-15')
  assert.equal(windows[0].desde, '2026-10-01')
  assert.equal(windows.at(-1).dtfim, '2026-10-15')
  for (const [index, window] of windows.entries()) {
    assert.ok((Date.parse(window.dtfim) - Date.parse(window.desde)) / 86_400_000 <= 5)
    if (index) assert.equal(window.desde, windows[index - 1].dtfim)
  }
})
