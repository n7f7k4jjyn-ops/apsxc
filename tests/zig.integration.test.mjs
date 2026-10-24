import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = 'zig-token-ultra-secret-9876'

async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

test('Zig: acesso admin, token protegido, teste de conexão e prévia sem gravação', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-zig-test-'))
  const requests = []
  let failCheckins = false
  const zig = createHttpServer((request, response) => {
    const url = new URL(request.url, 'http://zig.test')
    requests.push({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), authorization: request.headers.authorization })
    response.setHeader('content-type', 'application/json')
    if (request.headers.authorization !== TOKEN) { response.statusCode = 401; return response.end('{"message":"unauthorized"}') }
    if (url.pathname === '/erp/lojas') return response.end(JSON.stringify([{ id: 'L1', name: 'Verdant' }, { id: 'L2', name: 'Outra' }]))
    if (url.pathname === '/erp/events') return response.end(JSON.stringify([{ id: 'E1', name: 'Noite', beginAt: '2026-10-10T22:00:00' }]))
    if (url.pathname === '/erp/checkins') {
      if (failCheckins) { response.statusCode = 400; return response.end(JSON.stringify({ message: `bad request for ${TOKEN.slice(0, 10)}... ${TOKEN}` })) }
      return response.end(JSON.stringify([{ id: 'z1', checkinTime: '2026-10-10T23:00:00', name: 'Maria Souza', document: '', phone: '+55 41 99999-1111' }]))
    }
    if (url.pathname === '/erp/compradores') return response.end('[]')
    response.statusCode = 404
    response.end('{}')
  })
  await new Promise((resolve) => zig.listen(0, '127.0.0.1', resolve))
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const password = 'zig-test-password'
  const salt = '1234567890abcdef1234567890abcdef'
  const passwordHash = `scrypt$16384$8$1$${salt}$${scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex')}`
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(port), VERDANT_SEED_TEST_STAFF: 'false',
    VERDANT_INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    VERDANT_ZIG_TEST_BASE_URL: `http://127.0.0.1:${zig.address().port}`,
    VERDANT_USERS_JSON: JSON.stringify(['admin', 'operator', 'viewer'].map((role) => ({ username: role, role, passwordHash }))),
  }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'VERDANT_ADMIN_USERNAME']) delete env[key]
  for (const key of ['DATA', 'SESSIONS', 'TASKS', 'CONTENT_PLAN', 'PREFERENCES', 'TEAM_USERS', 'CHATS', 'CUSTOMERS', 'INTEGRATIONS', 'JOB_APPLICATIONS', 'TEAM_REGISTRATIONS', 'OPERATIONS', 'FINANCE']) {
    env[`VERDANT_${key}_FILE`] = path.join(directory, `${key.toLowerCase()}.json`)
  }
  let logs = ''
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })
  async function login(username) {
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie').split(';', 1)[0]
  }
  const call = async (cookie, method, route, body) => {
    const response = await fetch(`${url}/api/admin/zig/${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, text: await response.text() }
  }
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(logs)
      try { if ((await fetch(`${url}/api/health`)).status === 200) break } catch { /* aguarda */ }
      await delay(50)
    }
    for (const cookie of ['', await login('operator'), await login('viewer')]) {
      assert.equal((await call(cookie, 'GET', 'config')).status, cookie ? 403 : 401)
      assert.equal((await call(cookie, 'PUT', 'config', { token: TOKEN })).status, cookie ? 403 : 401)
      assert.equal((await call(cookie, 'POST', 'preview', { dtinicio: '2026-10-10', dtfim: '2026-10-10' })).status, cookie ? 403 : 401)
    }
    assert.equal(requests.length, 0)

    const admin = await login('admin')
    const initial = JSON.parse((await call(admin, 'GET', 'config')).text).settings
    assert.deepEqual(initial.missing, ['token', 'rede', 'loja'])
    assert.equal((await call(admin, 'POST', 'test')).status, 409)

    assert.equal((await call(admin, 'PUT', 'config', { baseUrl: 'https://evil.example' })).status, 400)
    assert.equal((await call(admin, 'PUT', 'config', { token: 'tem espaço' })).status, 400)
    assert.equal((await call(admin, 'PUT', 'config', { redeId: 'a/b' })).status, 400)

    const saved = await call(admin, 'PUT', 'config', { token: TOKEN, redeId: 'rede-9' })
    assert.equal(saved.status, 200)
    assert.ok(!saved.text.includes(TOKEN))
    assert.deepEqual(JSON.parse(saved.text).settings.missing, ['loja'])
    assert.ok(!(await call(admin, 'GET', 'config')).text.includes(TOKEN))
    const stored = await readFile(env.VERDANT_INTEGRATIONS_FILE, 'utf8')
    assert.ok(!stored.includes(TOKEN), 'o token deve ficar criptografado em disco')
    assert.ok(JSON.parse(stored).secrets.zigToken.ciphertext)

    const tested = await call(admin, 'POST', 'test')
    assert.equal(tested.status, 200)
    assert.equal(JSON.parse(tested.text).storeCount, 2)
    assert.equal(requests.at(-1).authorization, TOKEN)
    assert.equal(requests.at(-1).query.rede, 'rede-9')

    assert.equal((await call(admin, 'POST', 'preview', { dtinicio: '2026-10-10', dtfim: '2026-10-10' })).status, 409)
    const stores = JSON.parse((await call(admin, 'GET', 'stores')).text).stores
    assert.deepEqual(stores.map((store) => store.id), ['L1', 'L2'])
    assert.equal((await call(admin, 'PUT', 'config', { lojaId: 'L1', lojaName: 'Verdant' })).status, 200)

    assert.equal((await call(admin, 'POST', 'preview', { dtinicio: '2026-10-10', dtfim: '2026-09-01' })).status, 400)
    const before = requests.length
    const preview = await call(admin, 'POST', 'preview', { dtinicio: '2026-10-10', dtfim: '2026-10-10' })
    assert.equal(preview.status, 200, preview.text)
    assert.ok(!preview.text.includes(TOKEN))
    const body = JSON.parse(preview.text).preview
    assert.equal(body.complete, true)
    assert.equal(body.summary.created, 1)
    const made = requests.slice(before)
    assert.ok(made.every((item) => item.method === 'GET'))
    assert.ok(made.some((item) => item.path === '/erp/checkins' && item.query.page === '1' && item.query.loja === 'L1'))
    assert.ok(made.some((item) => item.path === '/erp/compradores'))

    failCheckins = true
    const failed = await call(admin, 'POST', 'preview', { dtinicio: '2026-10-10', dtfim: '2026-10-10' })
    assert.equal(failed.status, 502)
    assert.ok(!('preview' in JSON.parse(failed.text)))
    for (const piece of [TOKEN, TOKEN.slice(0, 10), 'bad request']) assert.ok(!failed.text.includes(piece), `vazou ${piece}`)
    assert.ok(!logs.includes(TOKEN), 'o token não pode aparecer nos logs')

    const after = JSON.parse(await readFile(env.VERDANT_INTEGRATIONS_FILE, 'utf8'))
    assert.equal(after.zig.lojaId, 'L1')
    await assert.rejects(readFile(env.VERDANT_CUSTOMERS_FILE, 'utf8'), { code: 'ENOENT' })
    await assert.rejects(readFile(env.VERDANT_FINANCE_FILE, 'utf8'), { code: 'ENOENT' })

    const cleared = await call(admin, 'PUT', 'config', { clearToken: true })
    assert.equal(JSON.parse(cleared.text).settings.tokenConfigured, false)
  } finally {
    if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit }
    zig.close()
    await rm(directory, { recursive: true, force: true })
  }
})
