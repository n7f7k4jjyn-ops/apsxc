import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const draft = (changes = {}) => ({
  externalId: '', type: 'payable', category: 'general', description: 'Conta',
  counterparty: 'Fornecedor', beneficiaryId: '', eventId: '', amountCents: 1250,
  dueDate: '2026-10-22', status: 'pending', settledDate: '', paymentMethod: '', notes: '', ...changes,
})

async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

test('finance API authorization, atomic imports, concurrency, audit and restart durability', { timeout: 45000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-finance-test-'))
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const password = 'finance-test-password'
  const salt = '1234567890abcdef1234567890abcdef'
  const hash = scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex')
  const passwordHash = `scrypt$16384$8$1$${salt}$${hash}`
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), VERDANT_SEED_TEST_STAFF: 'false',
    VERDANT_USERS_JSON: JSON.stringify(['admin', 'operator', 'viewer'].map(role => ({ username: role, role, passwordHash }))),
  }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'VERDANT_ADMIN_USERNAME']) delete env[key]
  for (const key of ['DATA', 'SESSIONS', 'TASKS', 'CONTENT_PLAN', 'PREFERENCES', 'TEAM_USERS', 'CHATS', 'CUSTOMERS', 'INTEGRATIONS', 'JOB_APPLICATIONS', 'TEAM_REGISTRATIONS', 'OPERATIONS', 'FINANCE']) {
    env[`VERDANT_${key}_FILE`] = path.join(directory, `${key.toLowerCase()}.json`)
  }
  let child
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let logs = ''
    child.stdout.on('data', chunk => { logs += chunk })
    child.stderr.on('data', chunk => { logs += chunk })
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(logs)
      try {
        if ((await fetch(`${url}/api/health`)).status === 200) return
      } catch { /* Wait for the HTTP listener. */ }
      await delay(50)
    }
    throw new Error(`Server did not start: ${logs}`)
  }
  async function stop() {
    if (!child || child.exitCode !== null) return
    const exit = once(child, 'exit')
    child.kill('SIGTERM')
    await exit
  }
  async function login(username) {
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie').split(';', 1)[0]
  }
  try {
    await start()
    await writeFile(env.VERDANT_TEAM_REGISTRATIONS_FILE, JSON.stringify([
      { id: 'old', name: 'Equipe', whatsapp: '41999999999', pixKey: 'old-pix', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'new', name: 'Equipe', whatsapp: '41999999999', pixKey: 'current-pix', createdAt: '2026-10-01T00:00:00Z' },
    ]))
    for (const cookie of ['', await login('operator'), await login('viewer')]) {
      for (const [method, endpoint, body] of [['GET', '', undefined], ['POST', '', { revision: 0, entries: [draft()] }], ['PUT', '/missing', { revision: 0, ...draft() }]]) {
        const response = await fetch(`${url}/api/finance${endpoint}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
        assert.equal(response.status, cookie ? 403 : 401)
        assert.equal(response.headers.get('cache-control'), 'no-store')
        assert.equal((await response.json()).entries, undefined)
      }
    }
    const cookie = await login('admin')
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' }
    const preferences = await fetch(`${url}/api/preferences`, { method: 'PUT', headers, body: JSON.stringify({ navigation: ['/', '/verdant/financeiro'] }) })
    assert.equal(preferences.status, 200)
    const get = () => fetch(`${url}/api/finance`, { headers })
    const post = body => fetch(`${url}/api/finance`, { method: 'POST', headers, body: JSON.stringify(body) })
    const put = (id, body) => fetch(`${url}/api/finance/${id}`, { method: 'PUT', headers, body: JSON.stringify(body) })
    const beforeState = await (await fetch(`${url}/api/state`, { headers })).json()
    const initial = await (await get()).json()
    assert.equal(initial.revision, 0)
    assert.deepEqual(initial.entries, [])
    assert.deepEqual(initial.beneficiaries.filter(person => person.kind === 'team'), [{ id: 'team:new', name: 'Equipe', kind: 'team', pixKey: 'current-pix' }])
    assert.ok(initial.beneficiaries.some(person => person.kind === 'dj' && person.id.startsWith('dj:')))
    assert.ok(initial.events.length)
    assert.equal((await fetch(`${url}/api/finance`, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body: '{}' })).status, 403)
    assert.equal((await post({ revision: 0, entries: [draft(), draft({ amountCents: 1.5 })] })).status, 400)
    assert.equal((await (await get()).json()).entries.length, 0)
    const firstResponse = await post({ revision: 0, entries: [draft({ externalId: 'sheet:1' }), draft({ category: 'team', beneficiaryId: 'team:new', counterparty: 'Untrusted', eventId: initial.events[0].id })] })
    assert.equal(firstResponse.status, 201)
    let ledger = await firstResponse.json()
    assert.equal(ledger.entries[1].counterparty, 'Equipe')
    const reimport = await (await post({ revision: 1, entries: [draft({ externalId: 'sheet:1', amountCents: 900 })] })).json()
    assert.equal(reimport.skipped, 1)
    assert.equal(reimport.revision, 1)
    assert.equal(reimport.entries[0].amountCents, 1250)
    const concurrent = await Promise.all([post({ revision: 1, entries: [draft()] }), post({ revision: 1, entries: [draft()] })])
    assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409])
    ledger = await (await get()).json()
    assert.equal(ledger.revision, 2)
    assert.equal(ledger.entries.length, 3)
    const id = ledger.entries[0].id
    const settled = await put(id, { revision: 2, status: 'settled', settledDate: '2026-10-23', paymentMethod: 'cash' })
    assert.equal(settled.status, 200)
    assert.equal((await put(id, { revision: 3, amountCents: 20 })).status, 409)
    const reopened = await put(id, { revision: 3, status: 'pending' })
    assert.equal(reopened.status, 200)
    const cancelled = await put(id, { revision: 4, status: 'cancelled' })
    assert.equal(cancelled.status, 200)
    ledger = await cancelled.json()
    assert.deepEqual(ledger.entries[0].history.map(item => item.action), ['created', 'settled', 'reopened', 'cancelled'])
    assert.equal(ledger.entries[0].paymentMethod, '')
    assert.equal(ledger.entries[0].settledDate, '')
    assert.deepEqual(await (await fetch(`${url}/api/state`, { headers })).json(), beforeState)
    assert.equal((await fetch(`${url}/api/public/meta-pixel`)).status, 200)
    await stop()
    await start()
    const restored = await (await get()).json()
    assert.equal(restored.revision, 5)
    assert.deepEqual(restored.entries, ledger.entries)
    for (const corrupt of ['{ broken', JSON.stringify({ revision: 5, entries: [{ amountCents: 'bad' }] })]) {
      await stop()
      await writeFile(env.VERDANT_FINANCE_FILE, corrupt)
      await start()
      assert.equal((await get()).status, 500)
      assert.equal((await post({ revision: 5, entries: [draft()] })).status, 500)
      assert.equal(await readFile(env.VERDANT_FINANCE_FILE, 'utf8'), corrupt)
      assert.equal((await fetch(`${url}/api/health`)).status, 200)
      assert.equal((await fetch(`${url}/api/public/meta-pixel`)).status, 200)
    }
  } finally {
    await stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('MySQL adapter keeps existing APIs available when lazy finance migration is corrupt', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-finance-mysql-adapter-test-'))
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const password = 'finance-adapter-test-password'
  const salt = 'abcdef1234567890abcdef1234567890'
  const passwordHash = `scrypt$16384$8$1$${salt}$${scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex')}`
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), DB_HOST: 'mock', DB_NAME: 'mock', DB_USER: 'mock', DB_PASSWORD: 'mock',
    VERDANT_SEED_TEST_STAFF: 'false', VERDANT_ADMIN_USERNAME: 'admin', VERDANT_USERS_JSON: JSON.stringify([{ username: 'admin', role: 'admin', passwordHash }]),
  }
  for (const key of ['DATA', 'SESSIONS', 'TASKS', 'CONTENT_PLAN', 'PREFERENCES', 'TEAM_USERS', 'CHATS', 'CUSTOMERS', 'INTEGRATIONS', 'JOB_APPLICATIONS', 'TEAM_REGISTRATIONS', 'OPERATIONS', 'FINANCE']) {
    env[`VERDANT_${key}_FILE`] = path.join(directory, `${key.toLowerCase()}.json`)
  }
  // An isolated adapter exercises startup and route behavior, not native SQL locking.
  const adapter = `
    const stores = new Map(), sessions = new Map()
    const pool = {
      async query(sql) {
        if (sql.includes('COUNT(*)')) return [[{ total: 0 }]]
        if (sql.includes('verdant_team_registrations') || sql.includes('CREATE TABLE') || sql === 'SELECT 1') return [[]]
        throw new Error('Unexpected mock query: ' + sql)
      },
      async execute(sql, values) {
        if (sql.startsWith('SELECT store_key')) return [stores.has(values[0]) ? [{ store_key: values[0] }] : []]
        if (sql.startsWith('SELECT payload FROM verdant_app_data')) return [stores.has(values[0]) ? [{ payload: stores.get(values[0]) }] : []]
        if (sql.startsWith('INSERT') && sql.includes('verdant_app_data')) {
          if (!sql.includes('IGNORE') || !stores.has(values[0])) stores.set(values[0], values[1])
          return [{ affectedRows: 1 }]
        }
        if (sql.startsWith('UPDATE verdant_app_data')) { stores.set(values[1], values[0]); return [{ affectedRows: 1 }] }
        if (sql.startsWith('DELETE FROM verdant_sessions')) return [{ affectedRows: 0 }]
        if (sql.startsWith('INSERT INTO verdant_sessions')) {
          sessions.set(values[0], { username: values[1], email: values[2], expiresAt: values[3] })
          return [{ affectedRows: 1 }]
        }
        if (sql.includes('FROM verdant_sessions')) return [sessions.has(values[0]) ? [sessions.get(values[0])] : []]
        throw new Error('Unexpected mock execute: ' + sql)
      },
      async getConnection() { return pool },
      async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    }
    export default { createPool: () => pool }
  `
  const loader = `import { registerHooks } from 'node:module'
    registerHooks({
      resolve(specifier, context, next) { return specifier === 'mysql2/promise' ? { url: 'finance-mysql:adapter', shortCircuit: true } : next(specifier, context) },
      load(url, context, next) { return url === 'finance-mysql:adapter' ? { format: 'module', source: ${JSON.stringify(adapter)}, shortCircuit: true } : next(url, context) }
    })`
  let child
  try {
    await writeFile(env.VERDANT_FINANCE_FILE, '{ invalid finance')
    child = spawn(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(loader)}`, 'server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let logs = ''
    child.stdout.on('data', chunk => { logs += chunk })
    child.stderr.on('data', chunk => { logs += chunk })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(logs)
      try { ready = (await fetch(`${url}/api/health`)).status === 200 } catch { /* Listener is starting. */ }
      if (ready) break
      await delay(50)
    }
    assert.equal(ready, true, logs)
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) })
    assert.equal(login.status, 200)
    const headers = { Cookie: login.headers.get('set-cookie').split(';', 1)[0], 'Content-Type': 'application/json' }
    const state = await (await fetch(`${url}/api/state`, { headers })).json()
    for (const corrupt of ['{ invalid finance', JSON.stringify({ revision: 0, entries: [{}] })]) {
      await writeFile(env.VERDANT_FINANCE_FILE, corrupt)
      assert.equal((await fetch(`${url}/api/finance`, { headers })).status, 500)
      assert.equal((await fetch(`${url}/api/finance`, { method: 'POST', headers, body: JSON.stringify({ revision: 0, entries: [draft()] }) })).status, 500)
      assert.equal(await readFile(env.VERDANT_FINANCE_FILE, 'utf8'), corrupt)
      assert.deepEqual(await (await fetch(`${url}/api/state`, { headers })).json(), state)
      assert.equal((await fetch(`${url}/api/public/meta-pixel`)).status, 200)
      assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { ok: true, storage: 'mysql', updatedAt: state.updatedAt || '' })
    }
    await writeFile(env.VERDANT_FINANCE_FILE, JSON.stringify({ revision: 4, entries: [] }))
    assert.equal((await (await fetch(`${url}/api/finance`, { headers })).json()).revision, 4)
    await writeFile(env.VERDANT_FINANCE_FILE, '{ stale corrupt JSON must not replace SQL')
    assert.equal((await (await fetch(`${url}/api/finance`, { headers })).json()).revision, 4)
    const created = await fetch(`${url}/api/finance`, { method: 'POST', headers, body: JSON.stringify({ revision: 4, entries: [draft()] }) })
    assert.equal(created.status, 201)
    assert.equal((await created.json()).revision, 5)
  } finally {
    if (child && child.exitCode === null) {
      const exit = once(child, 'exit')
      child.kill('SIGTERM')
      await exit
    }
    await rm(directory, { recursive: true, force: true })
  }
})
