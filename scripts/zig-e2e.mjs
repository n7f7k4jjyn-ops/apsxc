// Validação ponta a ponta no navegador (Playwright) com base de teste isolada e Zig simulada.
// Uso: npm run build && node scripts/zig-e2e.mjs   (não toca em nenhum banco real nem na Zig real)
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = 'zig-e2e-token-123456'
const PASSWORD = 'e2e-password-1'
const results = []
const check = (name, fn) => fn().then(() => { results.push([name, 'OK']); console.log(`OK   ${name}`) }, (error) => { results.push([name, `FALHOU: ${error.message}`]); console.log(`FAIL ${name}\n     ${error.message}`); process.exitCode = 1 })

const CPF_A = '52998224725'
const CPF_B = '11144477735'
const CPF_C = '39053344705'
const CPF_D = '12345678909'

const checkins = [
  { id: 'z1', checkinTime: '2026-10-10T23:00:00', name: 'Maria Souza', phone: '+55 41 99999-1111' },
  { id: 'z2', checkinTime: '2026-10-10T23:10:00', name: 'João Pereira', phone: '41 98888-2222', document: CPF_A, birthDate: '1990-05-17' },
  { id: 'z3', checkinTime: '2026-10-10T23:20:00', name: 'Ana Lima', phone: '41 97777-3333', document: CPF_C },
  { id: 'z4', checkinTime: '2026-10-10T23:30:00', name: 'Bruno Costa', phone: '41 96666-4444' },
  { id: 'z5', checkinTime: '2026-10-10T23:40:00', name: 'Eduardo Faria', phone: '41 95555-5555', document: CPF_B },
  { id: 'z6', checkinTime: '2026-10-10T23:50:00', name: 'Carla Mendes', phone: '41 94444-6666' },
  { id: 'z7', checkinTime: '2026-10-11T00:10:00', name: 'Diego Santos', phone: '41 93333-7777' },
  { id: 'z8', checkinTime: '2026-10-10T23:55:00', name: 'Marta Gomes', phone: '41 92020-3030', document: CPF_D },
]
const buyers = [{ userName: 'João Pereira', userPhone: '41 98888-2222', userDocument: CPF_A, userEmail: 'joao@example.com', date: '2026-10-10T23:15:00' }]
const events = [
  { id: 'E1', name: 'Noite 1', beginAt: '2026-10-10T22:00:00' },
  { id: 'E2', name: 'Noite 2', beginAt: '2026-10-17T22:00:00' },
]
const seedCustomers = [
  { sourceId: 's1', name: 'João Pereira', phone: '41 98888-2222' },
  { sourceId: 's2', name: 'Ana Lima', phone: '41 97777-3333' },
  { sourceId: 's3', name: 'Carlos Dias', phone: '41 90000-1212', cpf: CPF_B },
  { sourceId: 's4', name: 'Bruno Costa', phone: '41 91111-0000' },
  { sourceId: 's5', name: 'Eduardo Faria', phone: '41 92222-0000' },
  { sourceId: 's6', name: 'Carla Mendes', phone: '41 93333-0000' },
  { sourceId: 's7', name: 'Diego Santos', phone: '41 94444-0000' },
  { sourceId: 's9', name: 'Marta Gomes', phone: '41 92020-3030' },
  { sourceId: 's10', name: 'Paulo Ramos', phone: '41 90202-0202', cpf: CPF_D },
  { sourceId: 's8', name: 'Somente Destino', phone: '41 90101-0101' },
]

async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function startStack({ backupDirIsFile = false } = {}) {
  const dataset = { checkins: [...checkins], buyers: [...buyers] }
  const zig = createHttpServer((request, response) => {
    const url = new URL(request.url, 'http://zig.test')
    response.setHeader('content-type', 'application/json')
    if (request.method !== 'GET' || request.headers.authorization !== TOKEN) { response.statusCode = 401; return response.end('{}') }
    if (url.pathname === '/erp/lojas') return response.end(JSON.stringify([{ id: 'L1', name: 'Verdant' }]))
    if (url.pathname === '/erp/events') return response.end(JSON.stringify(events))
    if (url.pathname === '/erp/checkins') {
      if (Number(url.searchParams.get('page')) > 1) return response.end('[]')
      const from = url.searchParams.get('desde').slice(0, 10)
      const to = new Date(Date.parse(`${url.searchParams.get('dtfim').slice(0, 10)}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10)
      return response.end(JSON.stringify(dataset.checkins.filter((row) => row.checkinTime.slice(0, 10) >= from && row.checkinTime.slice(0, 10) <= to)))
    }
    if (url.pathname === '/erp/compradores') return response.end(JSON.stringify(dataset.buyers))
    response.statusCode = 404
    response.end('{}')
  })
  await new Promise((resolve) => zig.listen(0, '127.0.0.1', resolve))
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-zig-e2e-'))
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const salt = '1234567890abcdef1234567890abcdef'
  const passwordHash = `scrypt$16384$8$1$${salt}$${scryptSync(PASSWORD, Buffer.from(salt, 'hex'), 64).toString('hex')}`
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(port), VERDANT_SEED_TEST_STAFF: 'false',
    VERDANT_INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    VERDANT_ZIG_TEST_BASE_URL: `http://127.0.0.1:${zig.address().port}`,
    VERDANT_USERS_JSON: JSON.stringify(['eibrnof', 'admin', 'operator'].map((name) => ({ username: name, role: name === 'operator' ? 'operator' : 'admin', passwordHash }))),
  }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'VERDANT_ADMIN_USERNAME']) delete env[key]
  const files = {}
  for (const key of ['DATA', 'SESSIONS', 'TASKS', 'CONTENT_PLAN', 'PREFERENCES', 'TEAM_USERS', 'CHATS', 'CUSTOMERS', 'INTEGRATIONS', 'JOB_APPLICATIONS', 'TEAM_REGISTRATIONS', 'OPERATIONS', 'FINANCE', 'ZIG_PENDING']) {
    files[key] = path.join(directory, `${key.toLowerCase()}.json`)
    env[`VERDANT_${key}_FILE`] = files[key]
  }
  files.BACKUPS = path.join(directory, 'backups')
  if (backupDirIsFile) await writeFile(files.BACKUPS, 'x')
  env.VERDANT_BACKUP_DIR = files.BACKUPS
  let logs = ''
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(logs)
    try { if ((await fetch(`${url}/api/health`)).status === 200) break } catch { /* aguarda */ }
    await delay(50)
  }
  const api = {
    async login(username) {
      const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD }) })
      assert.equal(response.status, 200)
      return response.headers.get('set-cookie').split(';', 1)[0]
    },
    async call(cookie, method, route, body) {
      const response = await fetch(`${url}${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const text = await response.text()
      return { status: response.status, text, json: () => JSON.parse(text) }
    },
  }
  const master = await api.login('eibrnof')
  const imported = await api.call(master, 'POST', '/api/customers/import', { sourceSystem: 'e2e-seed', customers: seedCustomers })
  assert.equal(imported.status, 200, imported.text)
  assert.equal((await api.call(master, 'PUT', '/api/admin/zig/config', { token: TOKEN, redeId: 'rede-e2e' })).status, 200)
  assert.equal((await api.call(master, 'PUT', '/api/admin/zig/config', { lojaId: 'L1', lojaName: 'Verdant' })).status, 200)
  const readCustomers = async () => JSON.parse(await readFile(files.CUSTOMERS, 'utf8'))
  const readPending = async () => JSON.parse(await readFile(files.ZIG_PENDING, 'utf8').catch(() => '{"items":[],"runs":[]}'))
  async function stop() { child.kill(); zig.close(); await rm(directory, { recursive: true, force: true }).catch(() => {}) }
  return { url, api, master, files, dataset, readCustomers, readPending, stop, logs: () => logs }
}

async function openZig(browser, stack, username = 'eibrnof') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const dialogs = []
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept() })
  await page.goto(`${stack.url}/sign-in-2`)
  await page.getByRole('textbox', { name: /nome de usuário/i }).fill(username)
  await page.getByLabel(/^Senha$/i).fill(PASSWORD)
  await page.getByRole('button', { name: /^Entrar$/i }).click()
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 15000 })
  await page.goto(`${stack.url}/apps`)
  return { page, context, dialogs }
}

async function previewFlow(page, from, to) {
  await page.locator('#zig summary').first().click()
  await page.getByLabel('Data inicial').fill(from)
  await page.getByLabel('Data final').fill(to)
  await page.getByRole('button', { name: 'Gerar prévia' }).click()
  await page.getByRole('button', { name: 'Gravar', exact: true }).waitFor({ timeout: 20000 })
}

const browser = await chromium.launch()
try {
  // ---- Cenário A: fluxo principal, repetição, backup, pendências, acesso negado ----
  const A = await startStack()
  try {
    const before = await A.readCustomers()
    const beforeHash = createHash('sha256').update(JSON.stringify(before)).digest('hex')
    const { page, dialogs, context } = await openZig(browser, A)
    await previewFlow(page, '2026-10-10', '2026-10-10')

    await check('1. Prévia não grava nada', async () => {
      assert.equal(createHash('sha256').update(JSON.stringify(await A.readCustomers())).digest('hex'), beforeHash)
      assert.equal((await A.readPending()).items.length, 0)
      await assert.rejects(readdir(A.files.BACKUPS), { code: 'ENOENT' })
    })

    await page.getByRole('button', { name: 'Gravar', exact: true }).click()
    await page.getByText(/^Gravado:/).waitFor({ timeout: 20000 })
    const reportText = await page.getByText(/^Gravado:/).innerText()
    console.log('     relatório:', reportText)
    const afterFirst = await A.readCustomers()
    const pendingFirst = await A.readPending()

    await check('1. Gravar → confirmação → relatório → Pendências visíveis', async () => {
      assert.equal(dialogs.length, 1)
      assert.match(dialogs[0], /Gravar agora\?/)
      assert.match(dialogs[0], /Nada é apagado nem sobrescrito/)
      assert.ok(pendingFirst.items.length >= 3, `pendências: ${pendingFirst.items.length}`)
      await page.getByText(/Pendências de divergência/).waitFor()
      assert.ok(!(await page.content()).includes('"raw"'))
    })

    await check('1. Escrita correta: cria, vincula, preenche só vazios, preserva destino', async () => {
      assert.ok(afterFirst.length > before.length)
      for (const original of before) assert.ok(afterFirst.some((customer) => customer.id === original.id), 'nenhum cliente removido')
      const joao = afterFirst.find((customer) => customer.name === 'João Pereira')
      assert.deepEqual(joao.zigRefs.map((ref) => ref.id), ['z2'])
      assert.equal(joao.email, 'joao@example.com')
      assert.equal(joao.birthday, '1990-05-17')
      assert.equal(joao.cpfKey, CPF_A)
      assert.equal(afterFirst.find((customer) => customer.name === 'Somente Destino').updatedAt, before.find((customer) => customer.name === 'Somente Destino').updatedAt)
      assert.equal(afterFirst.find((customer) => customer.name === 'Carlos Dias').cpfKey, CPF_B)
      const ana = afterFirst.find((customer) => customer.name === 'Ana Lima')
      assert.equal(ana.cpfKey, CPF_C)
      assert.deepEqual(ana.zigRefs.map((ref) => ref.id), ['z3'])
      const marta = afterFirst.find((customer) => customer.name === 'Marta Gomes')
      assert.ok(!marta.cpfKey, 'CPF já usado por outro cliente não é preenchido')
      assert.deepEqual(marta.zigRefs.map((ref) => ref.id), ['z8'])
      assert.equal(afterFirst.find((customer) => customer.name === 'Paulo Ramos').cpfKey, CPF_D)
      assert.ok(afterFirst.some((customer) => customer.name === 'Maria Souza' && customer.sourceSystem === 'zig'))
      assert.equal(new Set(afterFirst.map((customer) => customer.cpfKey).filter(Boolean)).size, afterFirst.filter((customer) => customer.cpfKey).length, 'sem CPF duplicado')
      await assert.rejects(readFile(A.files.FINANCE, 'utf8'), { code: 'ENOENT' })
    })

    await check('4. Backup completo, recuperável e anterior à escrita', async () => {
      const names = await readdir(A.files.BACKUPS)
      assert.equal(names.length, 1)
      const backup = JSON.parse(await readFile(path.join(A.files.BACKUPS, names[0]), 'utf8'))
      assert.equal(JSON.stringify(backup.customers), JSON.stringify(before), 'backup = estado exato anterior à gravação')
      assert.ok(backup.zigPending && Array.isArray(backup.zigPending.items))
      await writeFile(A.files.CUSTOMERS, JSON.stringify(backup.customers))
      assert.equal(JSON.stringify(await A.readCustomers()), JSON.stringify(before), 'restauração devolve o estado original')
      await writeFile(A.files.CUSTOMERS, JSON.stringify(afterFirst))
    })

    await check('2. Repetir a mesma importação não duplica clientes nem vínculos', async () => {
      await page.reload()
      await previewFlow(page, '2026-10-10', '2026-10-10')
      await page.getByRole('button', { name: 'Gravar', exact: true }).click()
      await page.getByText(/^Gravado:/).waitFor({ timeout: 20000 })
      const again = await A.readCustomers()
      assert.equal(again.length, afterFirst.length)
      assert.equal(JSON.stringify(again), JSON.stringify(afterFirst), 'nenhum registro alterado')
      const pendingAgain = await A.readPending()
      assert.equal(pendingAgain.items.length, pendingFirst.items.length, 'pendências não duplicam')
      assert.equal(again.flatMap((customer) => customer.zigRefs || []).length, new Set(again.flatMap((customer) => (customer.zigRefs || []).map((ref) => ref.id))).size)
    })

    // 5. Pendências: vincular, criar, ignorar
    const open = (await A.readPending()).items.filter((item) => item.status === 'open')
    console.log('     pendências abertas:', open.map((item) => `${item.name}[${item.reasons}]`).join('; '))
    const row = (name) => page.locator('li', { hasText: name }).first()
    await page.reload()
    await page.locator('#zig summary').first().click()
    await page.getByText(/Pendências de divergência/).waitFor()

    await check('5. Vincular pendência a cliente sugerido', async () => {
      await row('Bruno Costa').getByRole('button', { name: /Vincular a/ }).first().click()
      await page.waitForFunction(() => !document.body.innerText.includes('ID Zig z4'), null, { timeout: 10000 })
      const customers = await A.readCustomers()
      const bruno = customers.find((customer) => customer.name === 'Bruno Costa')
      assert.deepEqual(bruno.zigRefs.map((ref) => ref.id), ['z4'])
      assert.equal(customers.length, afterFirst.length, 'vincular não cria cliente')
    })
    await check('5. Criar como novo, com CPF já utilizado (sem CPF, sem violar unicidade)', async () => {
      await row('Eduardo Faria').getByRole('button', { name: 'Criar como novo' }).click()
      await page.waitForFunction(() => !document.body.innerText.includes('ID Zig z5'), null, { timeout: 10000 })
      const customers = await A.readCustomers()
      const novos = customers.filter((customer) => customer.sourceSystem === 'zig' && customer.sourceId === 'z5')
      assert.equal(novos.length, 1)
      assert.ok(!novos[0].cpfKey, 'CPF de Carlos Dias não duplicado')
      assert.equal(customers.filter((customer) => customer.cpfKey === CPF_B).length, 1)
    })
    await check('5. Ignorar pendência', async () => {
      const count = (await A.readCustomers()).length
      await row('Carla Mendes').getByRole('button', { name: 'Ignorar' }).click()
      await page.waitForFunction(() => !document.body.innerText.includes('ID Zig z6'), null, { timeout: 10000 })
      assert.equal((await A.readCustomers()).length, count)
      assert.equal((await A.readPending()).items.find((item) => item.zigId === 'z6').status, 'ignored')
    })
    await check('5. Pendência resolvida não pode ser resolvida de novo (409) e chave inexistente dá 404', async () => {
      const dup = await A.api.call(A.master, 'POST', '/api/admin/zig/pending/resolve', { key: 'zig:z6', action: 'create' })
      assert.equal(dup.status, 409)
      assert.equal((await A.api.call(A.master, 'POST', '/api/admin/zig/pending/resolve', { key: 'zig:nada', action: 'ignore' })).status, 404)
      const link = await A.api.call(A.master, 'POST', '/api/admin/zig/pending/resolve', { key: 'zig:z7', action: 'link', customerId: 'inexistente' })
      assert.equal(link.status, 400)
    })

    await check('6. Decisões salvas não eliminam pendências de outros clientes/eventos', async () => {
      A.dataset.checkins.push(
        { id: 'z9', checkinTime: '2026-10-17T23:00:00', name: 'Bruno Costa', phone: '41 90909-9090' },
        { id: 'z10', checkinTime: '2026-10-17T23:05:00', name: 'Carla Mendes', phone: '41 90808-8080' },
      )
      await page.reload()
      await previewFlow(page, '2026-10-17', '2026-10-17')
      await page.getByRole('button', { name: 'Gravar', exact: true }).click()
      await page.getByText(/^Gravado:/).waitFor({ timeout: 20000 })
      const items = (await A.readPending()).items
      const by = (id) => items.find((item) => item.zigId === id)
      assert.equal(by('z4').status, 'linked')
      assert.equal(by('z5').status, 'created')
      assert.equal(by('z6').status, 'ignored', 'decisão anterior mantida')
      assert.equal(by('z7').status, 'open', 'pendência aberta de outro cliente permanece')
      assert.ok(by('z9') && by('z9').status === 'open', 'mesmo nome, outro ID Zig/evento: pendência legítima nova')
      assert.ok(by('z10') && by('z10').status === 'open', 'ignorar Carla (z6) não esconde outra Carla (z10)')
    })

    await check('5. Acesso negado para outros usuários (API e interface)', async () => {
      for (const username of ['admin', 'operator']) {
        const cookie = await A.api.login(username)
        for (const [method, route, body] of [['GET', 'config'], ['GET', 'pending'], ['POST', 'pending/resolve', { key: 'zig:z7', action: 'ignore' }], ['POST', 'apply', { dtinicio: '2026-10-10', dtfim: '2026-10-10', confirm: true, expected: { updates: 0, creates: 0 } }]]) {
          assert.equal((await A.api.call(cookie, method, `/api/admin/zig/${route}`, body)).status, 403, `${username} ${route}`)
        }
      }
      assert.equal((await A.api.call('', 'GET', '/api/admin/zig/pending')).status, 401)
      const other = await openZig(browser, A, 'admin')
      await other.page.waitForLoadState('networkidle')
      assert.equal(await other.page.locator('#zig').count(), 0, 'administrador comum não vê a seção Zig')
      await other.context.close()
      assert.equal((await A.readPending()).items.find((item) => item.zigId === 'z7').status, 'open', 'nada foi alterado')
    })
    assert.ok(!A.logs().includes(TOKEN), 'token nos logs')
    await context.close()
  } finally { await A.stop() }

  // ---- Cenário B: base alterada após a prévia ----
  const B = await startStack()
  try {
    const { page, dialogs, context } = await openZig(browser, B)
    await previewFlow(page, '2026-10-10', '2026-10-10')
    await check('3. Base alterada após a prévia → gravação recusada integralmente', async () => {
      const imported = await B.api.call(B.master, 'POST', '/api/customers/import', { sourceSystem: 'e2e-concorrente', customers: [{ sourceId: 'x1', name: 'Maria Souza', phone: '41 99999-1111' }] })
      assert.equal(imported.status, 200)
      const snapshot = JSON.stringify(await B.readCustomers())
      await page.getByRole('button', { name: 'Gravar', exact: true }).click()
      await page.getByText(/Os dados mudaram desde a prévia/).waitFor({ timeout: 15000 })
      assert.equal(dialogs.length, 1)
      assert.equal(JSON.stringify(await B.readCustomers()), snapshot, 'nenhum cliente alterado')
      assert.equal((await B.readPending()).items.length, 0, 'nenhuma pendência gravada')
      await assert.rejects(readdir(B.files.BACKUPS), { code: 'ENOENT' }, 'nem backup é criado')
      assert.ok(!(await page.getByText(/^Gravado:/).count()))
    })
    await context.close()
  } finally { await B.stop() }

  // ---- Cenário C: falha de backup ----
  const C = await startStack({ backupDirIsFile: true })
  try {
    const { page, context } = await openZig(browser, C)
    await previewFlow(page, '2026-10-10', '2026-10-10')
    await check('4. Falha no backup → nada é gravado', async () => {
      const snapshot = JSON.stringify(await C.readCustomers())
      await page.getByRole('button', { name: 'Gravar', exact: true }).click()
      await page.waitForFunction(() => document.body.innerText.includes('Gravando') === false, null, { timeout: 15000 })
      await delay(500)
      assert.equal(await page.getByText(/^Gravado:/).count(), 0)
      assert.equal(JSON.stringify(await C.readCustomers()), snapshot)
      assert.equal((await C.readPending()).items.length, 0)
      const direct = await C.api.call(C.master, 'POST', '/api/admin/zig/apply', { dtinicio: '2026-10-10', dtfim: '2026-10-10', confirm: true, expected: { updates: 2, creates: 2 } })
      assert.ok(direct.status >= 400, `status ${direct.status}`)
      assert.ok(!direct.text.includes(TOKEN))
    })
    await context.close()
  } finally { await C.stop() }
  // ---- Cenário D: seções fechadas ao entrar e rolagem da tela /apps ----
  const D = await startStack()
  try {
    for (const [label, viewport] of [['desktop', { width: 1280, height: 720 }], ['celular', { width: 390, height: 700 }]]) {
      const { page, context } = await openZig(browser, D)
      await page.setViewportSize(viewport)
      await page.goto(`${D.url}/apps`)
      await page.locator('#integracoes').waitFor()
      await check(`7. ${label}: Meta Pixel e Zig começam fechados`, async () => {
        assert.equal(await page.locator('#integracoes').evaluate((node) => node.open), false)
        assert.equal(await page.locator('#zig').evaluate((node) => node.open), false)
      })
      await check(`7. ${label}: rolagem vertical funciona fechado, aberto e após a prévia`, async () => {
        const total = () => page.evaluate(() => [...document.querySelectorAll('*'), document.scrollingElement].reduce((sum, node) => sum + (node.scrollTop || 0), 0))
        const scrolls = async () => {
          await page.evaluate(() => { for (const node of [...document.querySelectorAll('*'), document.scrollingElement]) node.scrollTop = 0 })
          await page.mouse.move(viewport.width / 2, viewport.height / 2)
          await page.mouse.wheel(0, 600)
          await delay(300)
          return (await total()) > 0
        }
        await page.locator('#integracoes summary').click()
        await page.locator('#zig summary').click()
        assert.equal(await scrolls(), true, 'aberto')
        await page.getByLabel('Data inicial').fill('2026-10-10')
        await page.getByLabel('Data final').fill('2026-10-10')
        await page.getByRole('button', { name: 'Gerar prévia' }).click()
        await page.getByRole('button', { name: 'Gravar', exact: true }).waitFor({ timeout: 20000 })
        assert.equal(await scrolls(), true, 'após a prévia')
        await page.evaluate(() => { for (const node of document.querySelectorAll('*')) if (node.scrollTop) node.scrollTop = 1e6 })
        assert.equal(await page.getByText('Filtrar apps...').count() + await page.getByPlaceholder('Filtrar apps...').count() > 0, true)
        assert.equal(await page.getByRole('button', { name: 'Gravar', exact: true }).isVisible(), true)
      })
      await context.close()
    }
  } finally { await D.stop() }
} finally {
  await browser.close()
}
console.log('\nResumo:')
for (const [name, status] of results) console.log(`${status === 'OK' ? 'OK  ' : 'FAIL'} ${name}`)
