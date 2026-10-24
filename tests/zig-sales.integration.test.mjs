import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { mkdtemp, readdir } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = 'zig-token-sales-4321'

async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

const sale = (extra) => ({ transactionId: 't1', transactionDate: '2026-10-09T23:30:00', unitValue: 1500, count: 1, discountValue: 0, productName: 'Drink', productCategory: 'Bar', eventId: 'E1', eventName: 'Noite', eventDate: '2026-10-09T00:00:00', type: 'Normal', isRefunded: false, ...extra })

test('Zig: conversão lista → presença e receita no Financeiro com backup e sem duplicar', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-zig-sales-'))
  const zigRequests = []
  const zig = createHttpServer((request, response) => {
    const url = new URL(request.url, 'http://zig.test')
    zigRequests.push({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams) })
    response.setHeader('content-type', 'application/json')
    if (request.headers.authorization !== TOKEN) { response.statusCode = 401; return response.end('{}') }
    if (url.pathname === '/erp/events') return response.end(JSON.stringify([{ id: 'E1', name: 'Noite', beginAt: '2026-10-09T22:00:00' }]))
    if (url.pathname === '/erp/checkins') {
      return response.end(JSON.stringify([
        { id: 'z1', checkinTime: '2026-10-09T23:00:00', name: 'Maria Souza', document: '', phone: '+55 41 99999-1111' },
        { id: 'z2', checkinTime: '2026-10-10T00:10:00', name: 'Joao Avulso', document: '', phone: '+55 41 98888-2222' },
      ]))
    }
    if (url.pathname === '/erp/compradores') return response.end('[]')
    if (url.pathname === '/erp/saida-produtos') {
      if (url.searchParams.get('refunded') === 'true') return response.end(JSON.stringify([sale({ unitValue: 1000, isRefunded: true })]))
      return response.end(JSON.stringify([
        sale({ unitValue: 1500, count: 2, discountValue: 500 }),
        sale({ transactionId: 't2', type: 'Entrance', unitValue: 3000, productCategory: 'Ingresso' }),
        sale({ transactionId: 't3', type: 'ZigCard', unitValue: 10000, productCategory: 'Recarga' }),
      ]))
    }
    response.statusCode = 404
    response.end('{}')
  })
  await new Promise((resolve) => zig.listen(0, '127.0.0.1', resolve))
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const password = 'zig-sales-password'
  const salt = '1234567890abcdef1234567890abcdef'
  const passwordHash = `scrypt$16384$8$1$${salt}$${scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex')}`
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(port), VERDANT_SEED_TEST_STAFF: 'false',
    VERDANT_INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    VERDANT_ZIG_TEST_BASE_URL: `http://127.0.0.1:${zig.address().port}`,
    VERDANT_USERS_JSON: JSON.stringify(['eibrnof', 'admin'].map((name) => ({ username: name, role: 'admin', passwordHash }))),
  }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'VERDANT_ADMIN_USERNAME']) delete env[key]
  for (const key of ['DATA', 'SESSIONS', 'TASKS', 'CONTENT_PLAN', 'PREFERENCES', 'TEAM_USERS', 'CHATS', 'CUSTOMERS', 'INTEGRATIONS', 'JOB_APPLICATIONS', 'TEAM_REGISTRATIONS', 'OPERATIONS', 'FINANCE', 'ZIG_PENDING']) {
    env[`VERDANT_${key}_FILE`] = path.join(directory, `${key.toLowerCase()}.json`)
  }
  env.VERDANT_BACKUP_DIR = path.join(directory, 'backups')
  let logs = ''
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })
  async function login(username) {
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie').split(';', 1)[0]
  }
  const call = async (cookie, route, body, method = 'POST') => {
    const response = await fetch(`${url}/api/admin/zig/${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, text: await response.text() }
  }
  const period = { dtinicio: '2026-10-09', dtfim: '2026-10-09' }
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(logs)
      try { if ((await fetch(`${url}/api/health`)).status === 200) break } catch { /* aguarda */ }
      await delay(50)
    }
    const other = await login('admin')
    for (const route of ['conversion', 'sales/preview', 'sales/apply']) {
      assert.equal((await call('', route, period)).status, 401)
      assert.equal((await call(other, route, { ...period, confirm: true, expected: { creates: 0 } })).status, 403)
    }
    assert.equal(zigRequests.length, 0)

    const admin = await login('eibrnof')
    assert.equal((await call(admin, 'config', { token: TOKEN, redeId: 'rede-1', lojaId: 'L1', lojaName: 'Verdant' }, 'PUT')).status, 200)
    const stateResponse = await fetch(`${url}/api/state`, { headers: { Cookie: admin } })
    const state = await stateResponse.json()
    const seedEvent = state.events.find((event) => event.date === '2026-10-09')
    assert.ok(seedEvent)
    const reg = (id, name, whatsapp) => ({ id, formKey: 'DJS', eventId: seedEvent.id, eventName: seedEvent.name, eventDate: seedEvent.date, name, whatsapp, email: '', status: 'Recebido', createdAt: '2026-10-08T10:00:00Z' })
    const saved = await fetch(`${url}/api/state`, {
      method: 'PUT', headers: { Cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state, registrations: [reg('r1', 'Maria Souza', '(41) 99999-1111'), reg('r2', 'Pedro Faltou', '(41) 97777-3333')] }),
    })
    assert.equal(saved.status, 200)

    const conversion = JSON.parse((await call(admin, 'conversion', period)).text).conversion
    const event = conversion.events[0]
    assert.equal(event.calculated, true)
    assert.equal(event.registered, 2)
    assert.equal(event.came, 1)
    assert.equal(event.conversionPercent, 50)
    assert.equal(event.walkInsWithoutList, 1)
    assert.deepEqual(event.lists.map((list) => [list.list, list.registered, list.came]), [['DJS', 2, 1]])

    const preview = JSON.parse((await call(admin, 'sales/preview', period)).text).preview
    assert.equal(preview.events[0].totalCents, 2500 + 3000)
    assert.equal(preview.events[0].refundedCents, 1000)
    assert.deepEqual(preview.events[0].excluded, [{ type: 'ZigCard', cents: 10000 }])
    assert.equal(preview.plan.creates, 2)
    assert.ok(zigRequests.every((item) => item.method === 'GET'))
    const financeBefore = await (await fetch(`${url}/api/finance`, { headers: { Cookie: admin } })).json()
    assert.equal(financeBefore.entries.length, 0)

    assert.equal((await call(admin, 'sales/apply', period)).status, 400)
    assert.equal((await call(admin, 'sales/apply', { ...period, confirm: true, expected: { creates: 1 } })).status, 409)
    assert.equal((await (await fetch(`${url}/api/finance`, { headers: { Cookie: admin } })).json()).entries.length, 0)
    assert.deepEqual(await readdir(env.VERDANT_BACKUP_DIR).catch(() => []), [])

    const applied = JSON.parse((await call(admin, 'sales/apply', { ...period, confirm: true, expected: { creates: 2 } })).text).report
    assert.equal(applied.created, 2)
    assert.ok(applied.backup)
    assert.ok((await readdir(env.VERDANT_BACKUP_DIR)).includes(applied.backup))
    const finance = await (await fetch(`${url}/api/finance`, { headers: { Cookie: admin } })).json()
    assert.deepEqual(finance.entries.map((entry) => entry.amountCents).sort(), [2500, 3000])
    assert.ok(finance.entries.every((entry) => entry.type === 'receivable' && entry.status === 'settled' && entry.eventId === seedEvent.id && entry.category === 'sales' && entry.externalId.startsWith('zig:sales:L1:E1:')))

    const again = JSON.parse((await call(admin, 'sales/apply', { ...period, confirm: true, expected: { creates: 0 } })).text).report
    assert.equal(again.created, 0)
    assert.equal(again.unchanged, 2)
    assert.equal((await (await fetch(`${url}/api/finance`, { headers: { Cookie: admin } })).json()).entries.length, 2)
    assert.ok(!logs.includes(TOKEN))
  } finally {
    child.kill()
    zig.close()
  }
})
