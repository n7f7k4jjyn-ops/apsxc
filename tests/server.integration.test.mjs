import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { migrateVerdantState } from '../lib/verdant-state-migration.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverPath = path.join(projectRoot, 'server.mjs')

test('state migration adds editable list copy without changing existing events or links', async () => {
  const seed = JSON.parse(await readFile(path.join(projectRoot, 'src', 'features', 'verdant', 'seed.json'), 'utf8'))
  const legacy = structuredClone(seed)
  legacy.version = 3
  legacy.formDescriptions = { LISTA_LOVERS: 'Texto personalizado já salvo.' }
  const original = Object.fromEntries(['events', 'forms', 'people', 'registrations'].map((key) => [key, structuredClone(legacy[key])]))

  const migrated = migrateVerdantState(legacy, seed)

  assert.equal(migrated.changed, true)
  assert.equal(migrated.state.version, 7)
  assert.equal(migrated.state.formDescriptions.LISTA_LOVERS, 'Texto personalizado já salvo.')
  assert.equal(migrated.state.formDescriptions.VIP, seed.formDescriptions.VIP)
  assert.equal(migrated.state.formDescriptions.ANIVERSARIO, seed.formDescriptions.ANIVERSARIO)
  // Novas migrações podem acrescentar eventos, formulários e DJs, mas nunca alterar
  // os registros históricos que já existiam antes da atualização.
  for (const event of original.events) assert.deepEqual(migrated.state.events.find((item) => item.id === event.id), event)
  for (const form of original.forms) assert.deepEqual(migrated.state.forms.find((item) => item.id === form.id), form)
  for (const person of original.people) {
    const current = migrated.state.people.find((item) => item.id === person.id)
    assert.ok(current, `person ${person.id} must remain present`)
    for (const key of ['id','kind','name','phone','email','instagram','notes','active']) assert.deepEqual(current[key], person[key])
    for (const eventId of person.eventIds) {
      assert.ok(current.eventIds.includes(eventId), `${person.id} must keep historical event ${eventId}`)
      assert.deepEqual(current.eventDetails?.[eventId], person.eventDetails?.[eventId])
    }
  }
  assert.deepEqual(migrated.state.registrations, original.registrations)
})

async function freePort() {
  const listener = createServer()
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve))
  const { port } = listener.address()
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()))
  return port
}

async function startServer(env, port) {
  const child = spawn(process.execPath, [serverPath], { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.logs = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => { child.logs += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk) => { child.logs += chunk })
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`O servidor encerrou durante a inicialização: ${child.logs}`)
    try {
      await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) })
      return child
    } catch {
      await delay(100)
    }
  }
  child.kill('SIGKILL')
  throw new Error(`O servidor não iniciou no prazo: ${child.logs}`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  const exited = once(child, 'exit')
  let timeoutId
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 3000)
  })
  child.kill('SIGTERM')
  await Promise.race([exited, timeout])
  clearTimeout(timeoutId)
}

test('DB_PORT alone keeps the server in JSON storage mode', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-db-port-test-'))
  const port = await freePort()
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_PORT: '3306',
    VERDANT_DATA_FILE: path.join(directory, 'verdant.json'),
    VERDANT_SESSIONS_FILE: path.join(directory, 'sessions.json'),
    VERDANT_TASKS_FILE: path.join(directory, 'tasks.json'),
    VERDANT_PREFERENCES_FILE: path.join(directory, 'preferences.json'),
    VERDANT_TEAM_USERS_FILE: path.join(directory, 'team-users.json'),
    VERDANT_CHATS_FILE: path.join(directory, 'chats.json'),
    VERDANT_CUSTOMERS_FILE: path.join(directory, 'customers.json'),
    VERDANT_INTEGRATIONS_FILE: path.join(directory, 'integrations.json'),
  }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete env[key]

  let child
  try {
    child = await startServer(env, port)
    const health = await fetch(`http://127.0.0.1:${port}/api/health`)
    assert.equal(health.status, 200)
    assert.equal((await health.json()).storage, 'json')
  } finally {
    await stopServer(child)
    await rm(directory, { recursive: true, force: true })
  }
})

test('MySQL startup failure keeps the HTTP service available and returns a clear API status', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-mysql-startup-test-'))
  const port = await freePort()
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    VERDANT_DATA_FILE: path.join(directory, 'verdant.json'),
    VERDANT_SESSIONS_FILE: path.join(directory, 'sessions.json'),
    VERDANT_TASKS_FILE: path.join(directory, 'tasks.json'),
    VERDANT_PREFERENCES_FILE: path.join(directory, 'preferences.json'),
    VERDANT_TEAM_USERS_FILE: path.join(directory, 'team-users.json'),
    VERDANT_CHATS_FILE: path.join(directory, 'chats.json'),
    VERDANT_CUSTOMERS_FILE: path.join(directory, 'customers.json'),
    VERDANT_INTEGRATIONS_FILE: path.join(directory, 'integrations.json'),
  }
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete env[key]

  let child
  try {
    child = await startServer(env, port)
    await delay(50)
    const health = await fetch(`http://127.0.0.1:${port}/api/health`)
    assert.equal(health.status, 503)
    assert.deepEqual(await health.json(), { ok: false, storage: 'mysql', database: 'unavailable' })

    const api = await fetch(`http://127.0.0.1:${port}/api/auth/session`)
    assert.equal(api.status, 503)
    assert.equal((await api.json()).code, 'MYSQL_UNAVAILABLE')
    assert.equal(child.exitCode, null)
  } finally {
    await stopServer(child)
    await rm(directory, { recursive: true, force: true })
  }
})

test('state conflicts, trusted client IPs, and sessions survive restarts without replacing corrupt JSON', { timeout: 45000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-server-test-'))
  const port = await freePort()
  const password = 'verdant-test-password-2026'
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`
  const managedPassword = 'managed-user-password-2026'
  const managedSalt = randomBytes(16)
  const managedDerived = scryptSync(managedPassword, managedSalt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const managedPasswordHash = `scrypt$16384$8$1$${managedSalt.toString('hex')}$${managedDerived.toString('hex')}`
  const statePath = path.join(directory, 'verdant.json')
  const sessionsPath = path.join(directory, 'sessions.json')
  const integrationsPath = path.join(directory, 'integrations.json')
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    TRUST_PROXY_HOPS: '0',
    VERDANT_USERS_JSON: JSON.stringify([
      { username: 'test-user', email: 'test@example.com', passwordHash },
      { email: 'managed@example.com', displayName: 'Managed member', passwordHash: managedPasswordHash },
    ]),
    VERDANT_DATA_FILE: statePath,
    VERDANT_SESSIONS_FILE: sessionsPath,
    VERDANT_TASKS_FILE: path.join(directory, 'tasks.json'),
    VERDANT_PREFERENCES_FILE: path.join(directory, 'preferences.json'),
    VERDANT_TEAM_USERS_FILE: path.join(directory, 'team-users.json'),
    VERDANT_CHATS_FILE: path.join(directory, 'chats.json'),
    VERDANT_CUSTOMERS_FILE: path.join(directory, 'customers.json'),
    VERDANT_INTEGRATIONS_FILE: integrationsPath,
    VERDANT_INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  }
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete env[key]

  let child
  const baseUrl = `http://127.0.0.1:${port}`
  try {
    child = await startServer(env, port)
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-user', password, rememberMe: true }),
    })
    assert.equal(login.status, 200)
    const loginResult = await login.json()
    assert.deepEqual(loginResult.user.role, ['admin'])
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
    assert.ok(cookie)
    assert.ok(loginResult.user.exp > Date.now() + 29 * 24 * 60 * 60 * 1000)

    const teamResponse = await fetch(`${baseUrl}/api/team`, { headers: { Cookie: cookie } })
    assert.equal(teamResponse.status, 200)
    assert.equal((await teamResponse.json()).users[0].username, 'test-user')
    const preventLastAdminRemoval = await fetch(`${baseUrl}/api/team/test-user`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Test Administrator', email: 'test@example.com', active: true, role: 'viewer' }),
    })
    assert.equal(preventLastAdminRemoval.status, 409)

    const saveIntegrations = await fetch(`${baseUrl}/api/admin/integrations`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metaPixelId: '1234567890',
        whatsappTarget: '+55 (41) 99999-1111',
        gmailTarget: 'contato@example.com',
        gmailClientId: 'client-id.apps.googleusercontent.com',
        gmailClientSecret: 'sensitive-google-client-secret',
        telegramTarget: '@verdant_contact',
        telegramBotToken: 'sensitive-telegram-bot-token',
      }),
    })
    assert.equal(saveIntegrations.status, 200)
    const integrationResult = await saveIntegrations.json()
    const integrationResponseText = JSON.stringify(integrationResult)
    assert.equal(integrationResult.settings.credentials.gmailClientSecretConfigured, true)
    assert.equal(integrationResult.settings.credentials.telegramBotTokenConfigured, true)
    assert.equal(integrationResponseText.includes('sensitive-google-client-secret'), false)
    assert.equal(integrationResponseText.includes('sensitive-telegram-bot-token'), false)
    const encryptedIntegrations = await readFile(integrationsPath, 'utf8')
    assert.equal(encryptedIntegrations.includes('sensitive-google-client-secret'), false)
    assert.equal(encryptedIntegrations.includes('sensitive-telegram-bot-token'), false)
    const publicPixel = await fetch(`${baseUrl}/api/public/meta-pixel`)
    assert.equal(publicPixel.status, 200)
    assert.deepEqual(await publicPixel.json(), { pixelId: '1234567890' })
    const adminIntegrationSettings = await (await fetch(`${baseUrl}/api/admin/integrations`, { headers: { Cookie: cookie } })).json()
    assert.equal(JSON.stringify(adminIntegrationSettings).includes('sensitive-google-client-secret'), false)
    assert.equal((await fetch(`${baseUrl}/api/integrations/shortcuts`, { headers: { Cookie: cookie } })).status, 404)

    const createTeammate = await fetch(`${baseUrl}/api/team`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'QA Teammate', username: 'qa-teammate', email: 'qa-teammate@example.com', password: 'qa-teammate-password-2026' }),
    })
    assert.equal(createTeammate.status, 201)
    const teammateCreated = (await createTeammate.json()).user
    assert.equal(teammateCreated.active, true)
    assert.equal(teammateCreated.role, 'operator')

    const chatRoster = await fetch(`${baseUrl}/api/chats`, { headers: { Cookie: cookie } })
    assert.equal(chatRoster.status, 200)
    assert.ok((await chatRoster.json()).users.some((user) => user.username === 'qa-teammate'))
    const createChat = await fetch(`${baseUrl}/api/chats`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: ['qa-teammate'] }),
    })
    assert.equal(createChat.status, 201)
    const chat = (await createChat.json()).conversation
    const sendChatMessage = await fetch(`${baseUrl}/api/chats/${encodeURIComponent(chat.id)}/messages`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Mensagem de teste da equipe.' }),
    })
    assert.equal(sendChatMessage.status, 201)
    assert.equal((await sendChatMessage.json()).conversation.messages[0].message, 'Mensagem de teste da equipe.')
    const adminConversations = await fetch(`${baseUrl}/api/chats`, { headers: { Cookie: cookie } })
    assert.equal(adminConversations.status, 200)
    const recipientConversation = (await adminConversations.json()).conversations.find((item) => item.id === chat.id)
    assert.equal(recipientConversation.messages[0].senderName, 'test-user')
    assert.equal(recipientConversation.messages[0].message, 'Mensagem de teste da equipe.')

    const editTeammate = await fetch(`${baseUrl}/api/team/qa-teammate`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'QA Teammate atualizado', email: 'qa-updated@example.com', active: true, password: 'qa-teammate-new-password-2026', role: 'operator' }),
    })
    assert.equal(editTeammate.status, 200)
    const editedTeammate = (await editTeammate.json()).user
    assert.equal(editedTeammate.displayName, 'QA Teammate atualizado')
    assert.equal(editedTeammate.role, 'operator')

    const editManagedUser = await fetch(`${baseUrl}/api/team/managed`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Managed member updated', email: 'managed-updated@example.com', active: true }),
    })
    assert.equal(editManagedUser.status, 200)
    const updateManagedUserAgain = await fetch(`${baseUrl}/api/team/managed`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Managed member final', email: 'managed-final@example.com', active: true }),
    })
    assert.equal(updateManagedUserAgain.status, 200)
    const managedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'managed', password: managedPassword }),
    })
    assert.equal(managedLogin.status, 200)
    assert.deepEqual((await managedLogin.clone().json()).user.role, ['viewer'])
    const managedCookie = managedLogin.headers.get('set-cookie')?.split(';', 1)[0]
    assert.ok(managedCookie)
    assert.equal((await fetch(`${baseUrl}/api/team`, { headers: { Cookie: managedCookie } })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: managedCookie } })).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/state`, { headers: { Cookie: managedCookie } })).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/tasks`, { headers: { Cookie: managedCookie } })).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/customers`, { headers: { Cookie: managedCookie } })).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/team/assignees`, { headers: { Cookie: managedCookie } })).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/admin/integrations`, { headers: { Cookie: managedCookie } })).status, 403)

    const viewerMutationHeaders = { Cookie: managedCookie, 'Content-Type': 'application/json' }
    assert.equal((await fetch(`${baseUrl}/api/chats`, { headers: { Cookie: managedCookie } })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/preferences`, { headers: { Cookie: managedCookie } })).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/preferences`, { method: 'PUT', headers: viewerMutationHeaders, body: JSON.stringify({ navigation: ['/'] }) })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/state`, { method: 'PUT', headers: viewerMutationHeaders, body: '{}' })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/tasks`, { method: 'POST', headers: viewerMutationHeaders, body: JSON.stringify({ title: 'Viewer task' }) })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/customers/import`, { method: 'POST', headers: viewerMutationHeaders, body: JSON.stringify({ customers: [] }) })).status, 403)
    const viewerCreateUser = await fetch(`${baseUrl}/api/team`, {
      method: 'POST', headers: viewerMutationHeaders,
      body: JSON.stringify({ displayName: 'Privilege Escalation', username: 'viewer-admin', email: 'viewer-admin@example.com', password: 'viewer-admin-password-2026', role: 'admin' }),
    })
    assert.equal(viewerCreateUser.status, 403)

    const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'qa-teammate', password: 'qa-teammate-new-password-2026', role: ['admin'] }),
    })
    assert.equal(operatorLogin.status, 200)
    assert.deepEqual((await operatorLogin.json()).user.role, ['operator'])
    const operatorCookieFromClaim = operatorLogin.headers.get('set-cookie')?.split(';', 1)[0]
    assert.ok(operatorCookieFromClaim)
    const operatorMutationHeaders = { Cookie: operatorCookieFromClaim, 'Content-Type': 'application/json' }
    assert.equal((await fetch(`${baseUrl}/api/chats`, { headers: { Cookie: operatorCookieFromClaim } })).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/admin/integrations`, { headers: { Cookie: operatorCookieFromClaim } })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/team`, { headers: { Cookie: operatorCookieFromClaim } })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/team`, { method: 'POST', headers: operatorMutationHeaders, body: JSON.stringify({ displayName: 'Privilege Escalation', username: 'operator-admin', email: 'operator-admin@example.com', password: 'operator-admin-password-2026', role: 'admin' }) })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/team/managed`, { method: 'PUT', headers: operatorMutationHeaders, body: JSON.stringify({ displayName: 'Privilege Escalation', email: 'managed@example.com', active: true, role: 'admin' }) })).status, 403)
    const operatorTask = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST', headers: operatorMutationHeaders,
      body: JSON.stringify({ title: 'Operator task', status: 'todo', label: 'feature', priority: 'medium' }),
    })
    assert.equal(operatorTask.status, 201)

    const importCustomers = await fetch(`${baseUrl}/api/customers/import`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceSystem: 'qa-import', customers: [
        { sourceId: 'qa-customer-a', name: 'QA Customer Alpha', cpf: '', phone: '41987654321', email: 'alpha@example.com', presenceCount: 4, lastVisitAt: '2026-09-10T12:00:00Z', availableBalance: 25, consumption: 125 },
        { sourceId: 'qa-customer-b', name: 'QA Customer Beta', cpf: '', phone: '41987654322', email: 'beta@example.com', presenceCount: 2, lastVisitAt: '2026-08-10T12:00:00Z', availableBalance: 10, consumption: 50 },
      ] }),
    })
    assert.equal(importCustomers.status, 200)
    const filterByColumn = await fetch(`${baseUrl}/api/customers?filters=${encodeURIComponent(JSON.stringify({ name: 'alpha', balance: '125' }))}`, { headers: { Cookie: cookie } })
    assert.equal(filterByColumn.status, 200)
    const filteredCustomers = await filterByColumn.json()
    assert.equal(filteredCustomers.total, 1)
    assert.equal(filteredCustomers.customers[0].name, 'QA Customer Alpha')
    const customersAscending = await (await fetch(`${baseUrl}/api/customers`, { headers: { Cookie: cookie } })).json()
    assert.deepEqual(customersAscending.customers.map((customer) => customer.name), ['QA Customer Alpha', 'QA Customer Beta'])
    const customersDescending = await (await fetch(`${baseUrl}/api/customers?sort=name&direction=desc`, { headers: { Cookie: cookie } })).json()
    assert.deepEqual(customersDescending.customers.map((customer) => customer.name), ['QA Customer Beta', 'QA Customer Alpha'])
    assert.equal((await fetch(`${baseUrl}/api/customers?sort=unknown`, { headers: { Cookie: cookie } })).status, 400)

    const initialResponse = await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } })
    assert.equal(initialResponse.status, 200)
    const initial = await initialResponse.json()
    const save = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(initial),
    })
    assert.equal(save.status, 200)
    const saved = await save.json()
    assert.equal(saved.revision, initial.revision + 1)

    const stale = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(initial),
    })
    assert.equal(stale.status, 409)
    assert.equal((await stale.json()).state.revision, saved.revision)

    const addUtcDays = (date, days) => {
      const next = new Date(`${date}T12:00:00Z`)
      next.setUTCDate(next.getUTCDate() + days)
      return next.toISOString().slice(0, 10)
    }
    const today = new Date().toISOString().slice(0, 10)
    const daysUntilSaturday = (6 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7 || 7
    const saturday = addUtcDays(today, daysUntilSaturday)
    const friday = addUtcDays(saturday, 6)
    const saturdayEvent = { id: 'qa-saturday', name: 'QA Saturday', date: saturday, eventTime: '22:00', entryValue: 100, active: true }
    const fridayEvent = { id: 'qa-friday', name: 'QA Friday', date: friday, eventTime: '22:00', entryValue: 100, active: true }
    const formKeys = ['DJS', 'INFLUENCIADORES', 'LISTA_LOVERS', 'VIP', 'ANIVERSARIO']
    const openAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const formConfig = (key, eventId, consent = true) => ({
      id: `qa-${key}-${eventId}`, key, eventId, enabled: true, openAt,
      requiredFields: { name: true, whatsapp: true, email: true, consent },
      price: 70, start: '22:00', end: '01:00', cutoff: '23:59', consumption: true,
      extra: '', publicText: '', maxGuests: 4, guestPriceMode: 'FIXO', guestPrice: 50,
      openBarTime: '', acceptsCake: true, skyConditions: '', birthdayRule: '',
    })
    const qaPeople = Array.from({ length: 5 }, (_, index) => ({
      id: `qa-dj-${index + 1}`, kind: 'DJ', name: `QA DJ ${index + 1}`, phone: '', email: '', instagram: '', notes: '', active: true,
      eventIds: ['qa-saturday'], eventDetails: { 'qa-saturday': { track: '', time: '', order: index + 1 } },
    }))
    qaPeople.push({ id: 'qa-dj-friday', kind: 'DJ', name: 'QA DJ Friday', phone: '', email: '', instagram: '', notes: '', active: true, eventIds: ['qa-friday'], eventDetails: { 'qa-friday': { track: '', time: '', order: 1 } } })
    qaPeople.push({ id: 'qa-influencer', kind: 'INFLUENCIADORES', name: 'QA Influencer', phone: '', email: '', instagram: '', notes: '', active: true, eventIds: ['qa-saturday'], eventDetails: { 'qa-saturday': { track: '', time: '', order: 1 } } })
    const qaState = {
      ...saved,
      formDescriptions: { ...saved.formDescriptions, LISTA_LOVERS: 'Texto editado no painel para validação.' },
      events: [saturdayEvent, fridayEvent],
      forms: [...formKeys.map((key) => formConfig(key, 'qa-saturday', key !== 'LISTA_LOVERS')), formConfig('DJS', 'qa-friday')],
      people: qaPeople,
      registrations: [],
    }
    const configureQa = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(qaState),
    })
    assert.equal(configureQa.status, 200)

    for (const slug of ['djs', 'influencers', 'lover', 'lovers', 'vip', 'aniversario']) {
      const formResponse = await fetch(`${baseUrl}/api/public/forms/${slug}`)
      assert.equal(formResponse.status, 200)
      assert.ok((await formResponse.json()).events.some((event) => event.id === 'qa-saturday'))
    }
    const publicLover = await (await fetch(`${baseUrl}/api/public/forms/lover`)).json()
    assert.equal(publicLover.description, 'Texto editado no painel para validação.')
    const publicLovers = await (await fetch(`${baseUrl}/api/public/forms/lovers`)).json()
    assert.equal(publicLovers.description, publicLover.description)
    assert.deepEqual(publicLovers.forms.map((form) => form.id), publicLover.forms.map((form) => form.id))
    const publicDjs = await (await fetch(`${baseUrl}/api/public/forms/djs`)).json()
    assert.equal(Object.hasOwn(publicDjs.people[0], 'active'), false)
    assert.deepEqual(publicDjs.people.find((person) => person.id === 'qa-dj-friday').eventIds, ['qa-friday'])
    const publicDjsForSaturday = publicDjs.people.filter((person) => person.eventIds.includes('qa-saturday')).map((person) => person.name)
    assert.deepEqual(publicDjsForSaturday, [...publicDjsForSaturday].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })))

    const postRegistration = (body) => fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const baseRegistration = (formKey, suffix, whatsapp) => ({
      formKey, eventId: 'qa-saturday', name: `QA ${suffix}`, whatsapp: `+55 (41) ${whatsapp}`,
      email: `${suffix.toLowerCase()}@example.com`, consent: true, consentAnswered: true,
      optionId: '', profileType: '', birthdayDate: '', guestNames: '',
    })
    const submissions = [
      { ...baseRegistration('DJS', 'DJ', '98765-0001'), optionId: 'qa-dj-1' },
      { ...baseRegistration('INFLUENCIADORES', 'Influencer', '98765-0002'), optionId: 'qa-influencer' },
      { ...baseRegistration('LISTA_LOVERS', 'Lover', '98765-0003'), consent: false, consentAnswered: false },
      { ...baseRegistration('VIP', 'VIP', '98765-0004'), profileType: 'Pessoa trans' },
      { ...baseRegistration('ANIVERSARIO', 'Birthday', '98765-0005'), birthdayDate: `1990${saturday.slice(4)}`, guestNames: ['Convidado QA 1', 'Convidado QA 2'] },
    ]
    for (const submission of submissions) assert.equal((await postRegistration(submission)).status, 201)
    assert.equal((await postRegistration(submissions[0])).status, 409)
    assert.equal((await postRegistration({ ...submissions[0], name: 'QA Outra pessoa', email: 'outra@example.com' })).status, 201)
    assert.equal((await postRegistration({ ...submissions[0], name: 'QA Invalid phone', whatsapp: '119999999' })).status, 400)
    assert.equal((await postRegistration({ ...submissions[4], name: 'QA Birthday outside week', whatsapp: '+55 (41) 98765-0007', birthdayDate: `1990${addUtcDays(saturday, 30).slice(4)}` })).status, 400)
    assert.equal((await postRegistration({ ...submissions[4], name: 'QA Invalid birthday date', whatsapp: '+55 (41) 98765-0008', birthdayDate: '1990-02-30' })).status, 400)
    assert.equal((await postRegistration({ ...submissions[4], name: 'QA Too many birthday guests', whatsapp: '+55 (41) 98765-0009', guestNames: ['A', 'B', 'C', 'D', 'E'] })).status, 400)
    assert.equal((await postRegistration({ ...submissions[4], name: 'QA Invalid guest', guestNames: `${'A'.repeat(121)}` })).status, 400)
    assert.equal((await postRegistration({ ...submissions[0], name: 'QA Fifth DJ', whatsapp: '+55 (41) 98765-0006', optionId: 'qa-dj-5' })).status, 201)

    const qaSavedState = await (await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } })).json()
    assert.equal(qaSavedState.registrations.length, 7)
    assert.equal(qaSavedState.registrations.find((registration) => registration.formKey === 'LISTA_LOVERS').consentAnswered, false)
    assert.equal(qaSavedState.registrations.find((registration) => registration.name === 'QA DJ').whatsapp, '41987650001')
    assert.equal(qaSavedState.registrations.find((registration) => registration.name === 'QA Fifth DJ').optionName, 'QA DJ 5')

    const archiveState = (state, active) => ({
      ...state,
      events: state.events.map((event) => event.id === 'qa-saturday' ? { ...event, active } : event),
    })
    const unauthorizedArchive = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Cookie: managedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(archiveState(qaSavedState, false)),
    })
    assert.equal(unauthorizedArchive.status, 403)
    assert.deepEqual(await (await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } })).json(), qaSavedState)

    const archiveEvent = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(archiveState(qaSavedState, false)),
    })
    assert.equal(archiveEvent.status, 200)
    const archivedState = await archiveEvent.json()
    assert.equal(archivedState.events.find((event) => event.id === 'qa-saturday').active, false)
    assert.deepEqual(archivedState.forms, qaSavedState.forms)
    assert.deepEqual(archivedState.people, qaSavedState.people)
    assert.deepEqual(archivedState.registrations, qaSavedState.registrations)

    const restoreEvent = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(archiveState(archivedState, true)),
    })
    assert.equal(restoreEvent.status, 200)
    const restoredState = await restoreEvent.json()
    assert.equal(restoredState.events.find((event) => event.id === 'qa-saturday').active, true)
    assert.deepEqual(restoredState.forms, qaSavedState.forms)
    assert.deepEqual(restoredState.people, qaSavedState.people)
    assert.deepEqual(restoredState.registrations, qaSavedState.registrations)

    const largeState = {
      ...restoredState,
      registrations: [...restoredState.registrations, {
        ...restoredState.registrations[0],
        id: 'qa-large-state',
        sourceDetails: 'x'.repeat(1_000_100),
      }],
    }
    assert.ok(Buffer.byteLength(JSON.stringify(largeState)) > 1_000_000)
    const saveLargeState = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(largeState),
    })
    assert.equal(saveLargeState.status, 200)
    const savedLargeState = await saveLargeState.json()
    const archiveLargeState = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(archiveState(savedLargeState, false)),
    })
    assert.equal(archiveLargeState.status, 200)
    const archivedLargeState = await archiveLargeState.json()
    assert.equal(archivedLargeState.events.find((event) => event.id === 'qa-saturday').active, false)
    assert.equal(archivedLargeState.registrations.find((registration) => registration.id === 'qa-large-state').sourceDetails.length, 1_000_100)

    const revokeManagedAccess = await fetch(`${baseUrl}/api/team/managed`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Managed member final', email: 'managed-final@example.com', active: false, role: 'viewer' }),
    })
    assert.equal(revokeManagedAccess.status, 200)
    assert.equal((await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: managedCookie } })).status, 401)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${attempt + 1}` },
        body: JSON.stringify({ username: 'missing-user', password: 'invalid' }),
      })
      assert.equal(failedLogin.status, 401)
    }
    const spoofedLimitAttempt = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.99' },
      body: JSON.stringify({ username: 'missing-user', password: 'invalid' }),
    })
    assert.equal(spoofedLimitAttempt.status, 401)

    const token = cookie.slice(cookie.indexOf('=') + 1)
    const storedSessions = JSON.parse(await readFile(sessionsPath, 'utf8'))
    assert.ok(storedSessions[createHash('sha256').update(token).digest('hex')])
    assert.equal(Object.hasOwn(storedSessions, token), false)

    await stopServer(child)
    child = await startServer(env, port)
    const restoredSession = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } })
    assert.equal(restoredSession.status, 200)
    assert.deepEqual((await restoredSession.json()).user.role, ['admin'])
    const restoredTeam = await fetch(`${baseUrl}/api/team`, { headers: { Cookie: cookie } })
    assert.equal((await restoredTeam.json()).users.find((user) => user.username === 'managed').email, 'managed-final@example.com')
    const persistedLargeState = await (await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } })).json()
    assert.equal(persistedLargeState.events.find((event) => event.id === 'qa-saturday').active, false)
    assert.equal(persistedLargeState.registrations.find((registration) => registration.id === 'qa-large-state').sourceDetails.length, 1_000_100)
    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })
    assert.equal(logout.status, 200)
    assert.equal((await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401)

    await stopServer(child)
    child = null
    const corruptContents = '{"events":'
    await writeFile(statePath, corruptContents, 'utf8')
    child = await startServer(env, port)
    const health = await fetch(`${baseUrl}/api/health`)
    assert.equal(health.status, 500)
    assert.match((await health.json()).error, /JSON inválido/)
    assert.equal(await readFile(statePath, 'utf8'), corruptContents)
  } finally {
    await stopServer(child)
    await rm(directory, { recursive: true, force: true })
  }
})

test('Admin Master/DEV account has full access and is hidden from the team list without affecting other users', { timeout: 45000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-master-test-'))
  const port = await freePort()
  const makeHash = (password) => {
    const salt = randomBytes(16)
    const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
    return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`
  }
  const masterPassword = 'master-test-password-2026'
  const viewerPassword = 'viewer-test-password-2026'
  const adminPassword = 'admin-test-password-2026'
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    TRUST_PROXY_HOPS: '0',
    VERDANT_USERS_JSON: JSON.stringify([
      { username: 'team-admin', email: 'admin@example.com', role: 'admin', passwordHash: makeHash(adminPassword) },
      { username: 'master', email: 'BRN@ScopeDeal.com.br', role: 'viewer', passwordHash: makeHash(masterPassword) },
      { username: 'viewer', email: 'viewer@example.com', role: 'viewer', passwordHash: makeHash(viewerPassword) },
      { username: 'eibrnof', email: 'dev@example.com', role: 'viewer', passwordHash: makeHash(masterPassword) },
    ]),
    VERDANT_DATA_FILE: path.join(directory, 'verdant.json'),
    VERDANT_SESSIONS_FILE: path.join(directory, 'sessions.json'),
    VERDANT_TASKS_FILE: path.join(directory, 'tasks.json'),
    VERDANT_PREFERENCES_FILE: path.join(directory, 'preferences.json'),
    VERDANT_TEAM_USERS_FILE: path.join(directory, 'team-users.json'),
    VERDANT_CHATS_FILE: path.join(directory, 'chats.json'),
    VERDANT_CUSTOMERS_FILE: path.join(directory, 'customers.json'),
    VERDANT_INTEGRATIONS_FILE: path.join(directory, 'integrations.json'),
    VERDANT_INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  }
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete env[key]
  const baseUrl = `http://127.0.0.1:${port}`
  const login = async (username, password) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
    })
    assert.equal(response.status, 200)
    return { cookie: response.headers.get('set-cookie').split(';', 1)[0], user: (await response.json()).user }
  }

  let child
  try {
    child = await startServer(env, port)
    const master = await login('master', masterPassword)
    const viewer = await login('viewer', viewerPassword)
    const admin = await login('team-admin', adminPassword)
    const devByUsername = await login('eibrnof', masterPassword)
    assert.deepEqual(master.user.role, ['admin'])
    assert.deepEqual(devByUsername.user.role, ['admin'])
    assert.deepEqual(viewer.user.role, ['viewer'])
    assert.equal((await fetch(`${baseUrl}/api/team`, { headers: { Cookie: devByUsername.cookie } })).status, 200)
    const reservedUsername = await fetch(`${baseUrl}/api/team`, {
      method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Impostor', username: 'eibrnof', email: 'other@example.com', password: 'impostor-password-2026' }),
    })
    assert.equal(reservedUsername.status, 409)

    for (const [session, expected] of [[master, 200], [admin, 200], [viewer, 403]]) {
      assert.equal((await fetch(`${baseUrl}/api/team`, { headers: { Cookie: session.cookie } })).status, expected)
      assert.equal((await fetch(`${baseUrl}/api/admin/integrations`, { headers: { Cookie: session.cookie } })).status, expected)
    }

    for (const session of [master, admin]) {
      const team = (await (await fetch(`${baseUrl}/api/team`, { headers: { Cookie: session.cookie } })).json()).users
      assert.deepEqual(team.map((user) => user.username).sort(), ['team-admin', 'viewer'])
      const assignees = (await (await fetch(`${baseUrl}/api/team/assignees`, { headers: { Cookie: session.cookie } })).json()).users
      assert.equal(assignees.some((user) => user.username === 'master'), false)
    }
    const viewerAssignees = await fetch(`${baseUrl}/api/team/assignees`, { headers: { Cookie: viewer.cookie } })
    assert.equal(viewerAssignees.status, 200)
    assert.equal((await viewerAssignees.json()).users.some((user) => user.username === 'master'), false)

    const editMaster = await fetch(`${baseUrl}/api/team/master`, {
      method: 'PUT', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Hacked', email: 'x@example.com', active: false, role: 'viewer' }),
    })
    assert.equal(editMaster.status, 404)

    const claimEmail = await fetch(`${baseUrl}/api/team`, {
      method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Impostor', username: 'impostor', email: 'brn@scopedeal.com.br', password: 'impostor-password-2026' }),
    })
    assert.equal(claimEmail.status, 409)
    const stealEmail = await fetch(`${baseUrl}/api/team/viewer`, {
      method: 'PUT', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Viewer', email: 'brn@scopedeal.com.br', active: true, role: 'viewer' }),
    })
    assert.equal(stealEmail.status, 409)
    assert.deepEqual((await login('viewer', viewerPassword)).user.role, ['viewer'])
  } finally {
    await stopServer(child)
    await rm(directory, { recursive: true, force: true })
  }
})


test('work applications validate optional choices, remain private and survive a server restart', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-jobs-'))
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), VERDANT_JOB_APPLICATIONS_FILE: path.join(directory, 'applications.json'), VERDANT_DATA_FILE: path.join(directory, 'state.json'), VERDANT_SESSIONS_FILE: path.join(directory, 'sessions.json'), VERDANT_TEAM_USERS_FILE: path.join(directory, 'users.json') }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete env[key]
  const salt = randomBytes(16)
  env.VERDANT_USERS_JSON = JSON.stringify([{ username: 'jobs-admin', passwordHash: `scrypt$16384$8$1$${salt.toString('hex')}$${scryptSync('test-password', salt, 64).toString('hex')}`, role: 'admin', active: true }])
  const submit = (value) => fetch(`${base}/api/public/job-applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  let child
  try {
    child = await startServer(env, port)
    assert.equal((await fetch(`${base}/api/job-applications`)).status, 401)
    assert.equal((await submit({ name: ' ', whatsapp: '41999999999' })).status, 400)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '123' })).status, 400)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '41999999999', roles: ['Inválida'] })).status, 400)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '41999999999', availability: ['Segunda-feira'] })).status, 400)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '41999999999', experience: 'x'.repeat(4001) })).status, 400)
    assert.equal((await submit(null)).status, 400)
    const minimal = await submit({ name: '  Nome Completo  ', whatsapp: '+55 (41) 99999-9999' })
    assert.equal(minimal.status, 201)
    assert.deepEqual(await minimal.json(), { ok: true })
    const full = { name: 'Outra Pessoa', whatsapp: '41988888888', roles: ['Caixa', 'Bar'], availability: ['Quinta-feira', 'Domingo'], experience: 'Atendimento e bar.' }
    const results = await Promise.all([submit(full), submit({ ...full, name: 'Terceira Pessoa' })])
    for (const result of results) assert.equal(result.status, 201)
    const disk = JSON.parse(await readFile(env.VERDANT_JOB_APPLICATIONS_FILE, 'utf8'))
    assert.equal(disk.length, 3)
    assert.equal(disk.find((row) => row.name === 'Nome Completo').whatsapp, '41999999999')
    assert.deepEqual(disk.find((row) => row.name === 'Nome Completo').roles, [])
    assert.deepEqual(disk.find((row) => row.name === full.name).availability, full.availability)
    await stopServer(child)
    child = await startServer(env, port)
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'jobs-admin', password: 'test-password' }) })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const list = await fetch(`${base}/api/job-applications`, { headers: { Cookie: cookie } })
    assert.equal(list.status, 200)
    assert.equal(list.headers.get('cache-control'), 'no-store')
    const saved = await list.json()
    assert.equal(saved.total, 3)
    assert.equal(saved.applications.length, 3)
    const next = await fetch(`${base}/api/job-applications?offset=50`, { headers: { Cookie: cookie } })
    assert.deepEqual((await next.json()).applications, [])
  } finally {
    await stopServer(child)
    await rm(directory, { recursive: true, force: true })
  }
})

test('team updates require Pix, isolate records and restrict payment data to administrators', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-team-updates-'))
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const salt = randomBytes(16)
  const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${scryptSync('test-password', salt, 64).toString('hex')}`
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), VERDANT_CUSTOMERS_FILE: path.join(directory, 'customers.json'), VERDANT_TASKS_FILE: path.join(directory, 'tasks.json'), VERDANT_TEAM_REGISTRATIONS_FILE: path.join(directory, 'team-updates.json'), VERDANT_OPERATIONS_FILE: path.join(directory,'operations.json'), VERDANT_JOB_APPLICATIONS_FILE: path.join(directory, 'applications.json'), VERDANT_DATA_FILE: path.join(directory, 'state.json'), VERDANT_SESSIONS_FILE: path.join(directory, 'sessions.json'), VERDANT_TEAM_USERS_FILE: path.join(directory, 'users.json'), VERDANT_USERS_JSON: JSON.stringify([{ username: 'updates-admin', passwordHash, role: 'admin', active: true }, { username: 'updates-operator', passwordHash, role: 'operator', active: true }]) }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete env[key]
  const submit = (value) => fetch(`${base}/api/public/team-registrations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  const login = async (username) => {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'test-password' }) })
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie').split(';')[0]
  }
  let child
  try {
    child = await startServer(env, port)
    assert.equal((await fetch(`${base}/api/team-registrations`)).status, 401)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '41999999999' })).status, 400)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '41999999999', pixKey: '   ' })).status, 400)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '41999999999', pixKey: 'x'.repeat(255) })).status, 400)
    assert.equal((await submit({ name: ' ', whatsapp: '41999999999', pixKey: 'teste@example.com' })).status, 400)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '123', pixKey: 'teste@example.com' })).status, 400)
    assert.equal((await submit({ name: 'Pessoa', whatsapp: '41999999999', pixKey: 'teste@example.com', roles: ['Inválida'] })).status, 400)
    const value = { name: '  Nome Completo  ', whatsapp: '+55 (41) 99999-9999', pixKey: '  teste@example.com  ' }
    const response = await submit(value)
    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), { ok: true })
    const results = await Promise.all([submit({ ...value, name: 'Outra Pessoa', roles: ['Caixa', 'Bar'], availability: ['Quinta-feira', 'Domingo'] }), submit({ ...value, name: 'Terceira Pessoa' })])
    for (const result of results) assert.equal(result.status, 201)
    const adminCookie = await login('updates-admin')
    const operatorCookie = await login('updates-operator')
    const importRequest = (cookie, records) => fetch(`${base}/api/team-registrations/import`, { method: 'POST', headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ records }) })
    const legacyRecord = { name: 'Pessoa Importada', whatsapp: '41999990000', roles: ['Bar'], availability: ['Sábado'], createdAt: '2026-10-20T12:00:00.000Z' }
    assert.equal((await importRequest(undefined, [legacyRecord])).status, 401)
    assert.equal((await importRequest(operatorCookie, [legacyRecord])).status, 403)
    const imported = await importRequest(adminCookie, [legacyRecord])
    assert.equal(imported.status, 200)
    assert.deepEqual(await imported.json(), { ok: true, imported: 1, skipped: 0 })
    const repeatedImport = await importRequest(adminCookie, [legacyRecord])
    assert.deepEqual(await repeatedImport.json(), { ok: true, imported: 0, skipped: 1 })
    assert.equal((await fetch(`${base}/api/team-registrations`, { headers: { Cookie: operatorCookie } })).status, 403)
    assert.equal((await fetch(`${base}/api/dashboard-summary`)).status, 401)
    const createTask = (value) => fetch(`${base}/api/tasks`, { method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
    assert.equal((await createTask({ title: 'Tarefa vencida', dueDate: '2000-01-01', status: 'todo' })).status, 201)
    assert.equal((await createTask({ title: 'Tarefa concluída', dueDate: '2000-01-01', status: 'done' })).status, 201)
    const dashboard = await fetch(`${base}/api/dashboard-summary`, { headers: { Cookie: adminCookie } })
    assert.equal(dashboard.headers.get('cache-control'), 'no-store')
    const summary = await dashboard.json()
    assert.equal(summary.teamRegistrations, 4)
    assert.equal(summary.jobApplications, 0)
    assert.equal(summary.tasks.pending, 1)
    assert.equal(summary.tasks.overdue, 1)
    assert.equal(summary.tasks.items[0].title, 'Tarefa vencida')
    assert.ok(!JSON.stringify(summary).includes('teste@example.com'))
    const operatorDashboard = await fetch(`${base}/api/dashboard-summary`, { headers: { Cookie: operatorCookie } })
    assert.equal((await operatorDashboard.json()).teamRegistrations, null)
    const list = await fetch(`${base}/api/team-registrations`, { headers: { Cookie: adminCookie } })
    assert.equal(list.status, 200)
    assert.equal(list.headers.get('cache-control'), 'no-store')
    const saved = await list.json()
    assert.equal(saved.total, 4)
    const record = saved.applications.find((row) => row.name === 'Nome Completo')
    assert.equal(record.pixKey, 'teste@example.com')
    assert.equal(record.whatsapp, '41999999999')
    assert.deepEqual(record.roles, [])
    const applications = await fetch(`${base}/api/job-applications`, { headers: { Cookie: adminCookie } })
    assert.equal((await applications.json()).total, 0)
    const postCandidate = await fetch(`${base}/api/public/job-applications`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:'Candidato Teste', whatsapp:'41999998888', roles:['Bar'], availability:['Sábado'], experience:'Experiência em bar', status:'approved' }) })
    assert.equal(postCandidate.status,201)
    assert.equal((await fetch(`${base}/api/registry/team`, { headers:{Cookie:operatorCookie} })).status,403)
    assert.equal((await fetch(`${base}/api/registry/candidates`)).status,401)
    const candidates = await (await fetch(`${base}/api/registry/candidates?q=Candidato&role=Bar`,{headers:{Cookie:adminCookie}})).json()
    assert.equal(candidates.total,1)
    const candidate = candidates.records[0]
    assert.equal(candidate.status,undefined,'Public payload must not approve itself')
    const review = (method, suffix, cookie, value) => fetch(`${base}/api/job-applications/${candidate.id}${suffix}`,{method,headers:{ Cookie:cookie, 'Content-Type':'application/json' },body:JSON.stringify(value)})
    assert.equal((await review('POST','/promote',adminCookie,{})).status,409)
    assert.equal((await review('PATCH','',operatorCookie,{status:'approved'})).status,403)
    assert.equal((await review('PATCH','',adminCookie,{status:'invalid'})).status,400)
    assert.equal((await review('PATCH','',adminCookie,{status:'reviewing'})).status,200)
    assert.equal((await review('PATCH','',adminCookie,{status:'approved'})).status,200)
    const promoted = await Promise.all([review('POST','/promote',adminCookie,{}),review('POST','/promote',adminCookie,{})])
    for (const response of promoted) assert.equal(response.status,200)
    const ids = await Promise.all(promoted.map(response=>response.json().then(value=>value.teamId)))
    assert.equal(ids[0],ids[1],'Retry must not duplicate team membership')
    const roster = await (await fetch(`${base}/api/registry/team?q=Candidato`,{headers:{Cookie:adminCookie}})).json()
    assert.equal(roster.total,1)
    assert.equal(roster.records[0].pixKey,'')
    assert.deepEqual(roster.records[0].roles,['Bar'])
    assert.equal((await review('PATCH','',adminCookie,{status:'rejected'})).status,409)
    // Roster authorization, activation, overnight dates, snapshots and concurrent edits.
    assert.equal((await fetch(`${base}/api/rosters`)).status,401)
    assert.equal((await fetch(`${base}/api/rosters`,{headers:{Cookie:operatorCookie}})).status,403)
    const rosterRequest = (method,suffix,value,cookie=adminCookie) => fetch(`${base}/api/rosters${suffix}`,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(value)})
    const scale = {date:'2026-10-18',eventId:'',kind:'staff',status:'finalized',template:4,entries:[{memberId:ids[0],name:'Forged name',role:'Bar',posts:['Terraço','Apoio'],availability:['Domingo'],entry:'18:00',exit:'04:00'}]}
    assert.equal((await rosterRequest('POST','',scale)).status,409,'Pending team cannot be scheduled')
    const setTeamStatus = (status,cookie=adminCookie) => fetch(`${base}/api/registry/team/${ids[0]}/status`,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({status})})
    assert.equal((await setTeamStatus('active',operatorCookie)).status,403)
    assert.equal((await setTeamStatus('invalid')).status,400)
    assert.equal((await setTeamStatus('active')).status,200)
    assert.equal((await rosterRequest('POST','',{...scale,date:'2026-02-30'})).status,400)
    assert.equal((await rosterRequest('POST','',{...scale,entries:[...scale.entries,...scale.entries]})).status,400)
    assert.equal((await rosterRequest('POST','',{...scale,entries:[{...scale.entries[0],role:'Segurança'}]})).status,400)
    assert.equal((await rosterRequest('POST','',{...scale,entries:[{...scale.entries[0],exit:'18:00'}]})).status,400)
    const createdScale = await rosterRequest('POST','',scale)
    assert.equal(createdScale.status,201)
    const storedScale = (await createdScale.json()).roster
    assert.equal(storedScale.entries[0].exitDate,'2026-10-19')
    assert.equal(storedScale.entries[0].name,'Candidato Teste')
    assert.deepEqual(storedScale.entries[0].availability,['Sábado'])
    const concurrent = await Promise.all([rosterRequest('PUT',`/${storedScale.id}`,{...storedScale,template:1}),rosterRequest('PUT',`/${storedScale.id}`,{...storedScale,template:2})])
    assert.deepEqual(concurrent.map(row=>row.status).sort(),[200,409])
    const rosterData = await (await fetch(`${base}/api/rosters`,{headers:{Cookie:adminCookie}})).json()
    assert.equal(rosterData.rosters.length,1)
    assert.equal(JSON.stringify(rosterData).includes('pixKey'),false)
    assert.equal((await setTeamStatus('inactive')).status,200)
    assert.equal((await rosterRequest('POST','',scale)).status,409)
    assert.equal((await setTeamStatus('active')).status,200)

    assert.equal((await fetch(`${base}/api/registry/clients`)).status,401)
    assert.equal((await fetch(`${base}/api/registry/clients`,{headers:{Cookie:operatorCookie}})).status,200)
    const clientState = await (await fetch(`${base}/api/state`,{headers:{Cookie:adminCookie}})).json()
    const makeClientRegistration = (id,name,phone) => ({ id, name, whatsapp:phone, email:'', eventId:'registry-event', eventName:'Evento Registry', eventDate:'2026-10-17', formKey:'LISTA_LOVERS', createdAt:'2026-10-17T12:00:00Z', status:'active', guestNames:[] })
    clientState.registrations = [makeClientRegistration('linked-1','Cliente Unificado','41987654321'),makeClientRegistration('linked-2','Cliente Unificado','41987654321'),...Array.from({length:60},(_,index)=>makeClientRegistration(`orphan-${index}`,`Pessoa ${index}`,'41987654322'))]
    assert.equal((await fetch(`${base}/api/state`,{method:'PUT',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify(clientState)})).status,200)
    assert.equal((await fetch(`${base}/api/customers/import`,{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({sourceSystem:'registry-test',customers:[{sourceId:'linked',name:'Cliente Unificado',phone:'41987654321',email:''}]})})).status,200)
    const clients = async query => (await fetch(`${base}/api/registry/clients?${query}`,{headers:{Cookie:adminCookie}})).json()
    const unified = await clients('q=Cliente')
    assert.equal(unified.total,1)
    assert.equal(unified.clients[0].history.length,2)
    const firstPage = await clients('offset=0')
    const secondPage = await clients('offset=50')
    assert.equal(firstPage.total,61)
    assert.equal(firstPage.clients.length,50)
    assert.equal(secondPage.clients.length,11)
    assert.equal(new Set([...firstPage.clients,...secondPage.clients].map(row=>row.id)).size,61)
    const eventClients = await clients('event=registry-event')
    assert.equal(eventClients.total,61)
    await stopServer(child)
    child = await startServer(env, port)
    const refreshed = await fetch(`${base}/api/team-registrations`, { headers: { Cookie: adminCookie } })
    assert.equal((await refreshed.json()).total, 5)
    const restoredScale = await (await fetch(`${base}/api/rosters`,{headers:{Cookie:adminCookie}})).json()
    assert.equal(restoredScale.rosters.length,1)
    assert.equal(restoredScale.team.find(row=>row.id===ids[0]).status,'active')
  } finally {
    await stopServer(child)
    await rm(directory, { recursive: true, force: true })
  }
})


test('requested test staff migrate to ten exclusive profiles per function, preserve real staff and manual status across restarts', {timeout:20000}, async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'verdant-test-staff-'))
  const port=await freePort(),salt=randomBytes(16),password='local-staff-test'
  const passwordHash=`scrypt$16384$8$1$${salt.toString('hex')}$${scryptSync(password,salt,64).toString('hex')}`
  const env={...process.env,NODE_ENV:'test',PORT:String(port),VERDANT_SEED_TEST_STAFF:'true',VERDANT_USERS_JSON:JSON.stringify([{username:'test-staff-admin',passwordHash,role:'admin',active:true}])}
  for(const key of ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'])delete env[key]
  for(const key of ['DATA','SESSIONS','TEAM_USERS','TEAM_REGISTRATIONS','OPERATIONS'])env[`VERDANT_${key}_FILE`]=path.join(directory,key+'.json')
  const real={id:'real-person',name:'Pessoa Existente',whatsapp:'41999999999',roles:['Bar'],availability:['Sábado'],pixKey:'existing-value',createdAt:'2026-10-01T12:00:00Z'}
  const legacy=Array.from({length:50},(_,i)=>({id:`team-test-${String(i+1).padStart(2,'0')}`,name:`Funcionário Teste ${String(i+1).padStart(2,'0')}`,whatsapp:'',pixKey:'',source:'test',createdAt:'2026-10-17T12:00:00Z',roles:['Caixa','Bar','Limpeza','Segurança','Cozinha','Bombeiro'],availability:['Quinta-feira','Sexta-feira','Sábado','Domingo']}))
  await writeFile(env.VERDANT_TEAM_REGISTRATIONS_FILE,JSON.stringify([...legacy,real]))
  let child
  try {
    child=await startServer(env,port)
    const login=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'test-staff-admin',password})})
    assert.equal(login.status,200)
    const cookie=login.headers.get('set-cookie').split(';')[0]
    const read=async()=> (await fetch(`http://127.0.0.1:${port}/api/rosters`,{headers:{Cookie:cookie}})).json()
    const data=await read()
    const tests=data.team.filter(row=>row.id.startsWith('team-test-'))
    assert.equal(tests.length,60)
    assert.equal(tests.find(row=>row.id==='team-test-01').name,'Funcionário Teste 01')
    assert.equal(tests.find(row=>row.id==='team-test-60').name,'Funcionário Teste 60')
    assert.ok(tests.every(row=>row.status==='active'&&row.roles.length===1&&row.availability.length===4))
    for(const role of ['Caixa','Bar','Limpeza','Segurança','Cozinha','Bombeiro']) {
      assert.equal(tests.filter(row=>row.roles[0]===role).length,10)
      const filtered=await (await fetch(`http://127.0.0.1:${port}/api/registry/team?role=${encodeURIComponent(role)}&q=Teste`,{headers:{Cookie:cookie}})).json()
      assert.equal(filtered.total,10);assert.ok(filtered.records.every(row=>row.roles.length===1&&row.roles[0]===role))
    }
    const disk=JSON.parse(await readFile(env.VERDANT_TEAM_REGISTRATIONS_FILE,'utf8'))
    assert.deepEqual(disk.find(row=>row.id===real.id),real)
    assert.ok(disk.filter(row=>row.source==='test').every(row=>row.whatsapp===''&&row.pixKey===''))
    const inactive=await fetch(`http://127.0.0.1:${port}/api/registry/team/team-test-01/status`,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({status:'inactive'})})
    assert.equal(inactive.status,200)
    await stopServer(child);child=await startServer(env,port)
    const restored=await read()
    assert.equal(restored.team.length,61)
    assert.equal(restored.team.find(row=>row.id==='team-test-01').status,'inactive')
    assert.equal(new Set(restored.team.map(row=>row.id)).size,61)
  } finally {await stopServer(child);await rm(directory,{recursive:true,force:true})}
})
