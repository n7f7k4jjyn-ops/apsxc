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
import { chromium, expect } from 'playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('finance deletion dialogs, filtered batches, scroll bounds and durable backups', { timeout: 180000 }, async () => {
  const listener = createServer()
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const directory = await mkdtemp(path.join(tmpdir(), 'verdant-navigation-'))
  const salt = Buffer.from('navigation-test-only')
  const password = 'local-navigation-test'
  const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    VERDANT_USERS_JSON: JSON.stringify([{ username: 'qa-navigation', passwordHash, role: 'admin', active: true }]),
  }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete env[key]
  for (const key of ['DATA', 'TASKS', 'CONTENT_PLAN', 'PREFERENCES', 'TEAM_USERS', 'CHATS', 'CUSTOMERS', 'SESSIONS', 'INTEGRATIONS', 'JOB_APPLICATIONS', 'TEAM_REGISTRATIONS', 'OPERATIONS', 'FINANCE', 'ZIG_PENDING', 'ZIG_REPORTS']) {
    env[`VERDANT_${key}_FILE`] = path.join(directory, `${key}.json`)
  }
  const data = JSON.parse(await readFile(path.join(root, 'src/features/verdant/seed.json'), 'utf8'))
  data.version = 7
  const [event, other] = data.events
  event.date = '2026-10-24'
  other.date = '2026-09-10'
  data.registrations = [event, other].map((item, index) => ({
    id: `registration-${index}`,
    eventId: item.id,
    eventName: item.name,
    eventDate: item.date,
    formKey: index === 0 ? 'ENTRADA_GRATUITA' : 'LISTA_LOVERS',
    name: `Pessoa de teste ${index}`,
    whatsapp: '',
    email: '',
    consent: false,
    optionId: '',
    optionName: '',
    profileType: '',
    birthdayDate: '',
    guestNames: [],
    status: 'Recebido',
    createdAt: '2026-10-24T21:00:00Z',
  }))
  await writeFile(env.VERDANT_DATA_FILE, JSON.stringify(data))
  env.VERDANT_BACKUP_DIR = path.join(directory, 'backups')
  const child = spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })
  let browser
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(`${base}/api/health`)).ok } catch { /* Server is starting. */ }
      if (ready) break
      await delay(100)
    }
    assert.ok(ready, `Local server must start: ${logs}`)
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu'] } : {}) })
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
    assert.equal((await context.request.post(`${base}/api/auth/login`, { data: { username: 'qa-navigation', password } })).status(), 200)
    const entries = Array.from({ length: 61 }, (_, index) => ({
      externalId: `zig:sales:test:${index}`, type: 'receivable', category: 'sales',
      description: index === 60 ? 'Preservar fora do filtro' : `Zig antiga ${index}`,
      counterparty: 'Zig', beneficiaryId: '', eventId: '', amountCents: 1000,
      dueDate: '2026-10-24', status: 'settled', settledDate: '2026-10-24', paymentMethod: 'cash', notes: '',
    }))
    const created = await context.request.post(`${base}/api/finance`, { data: { revision: 0, entries } })
    assert.equal(created.status(), 201)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/verdant/financeiro`)
    await expect(page.getByRole('button', { name: 'Novo lançamento', exact: true })).toBeEnabled()
    const list = page.getByRole('region', { name: 'Lista de lançamentos', exact: true })
    await expect(list.locator('tbody tr')).toHaveCount(61)
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      assert.ok(await list.evaluate(el => el.clientHeight <= innerHeight * .6 + 2 && el.scrollHeight > el.clientHeight))
      await page.getByLabel('Selecionar todos do filtro', { exact: false }).check()
      await page.getByRole('button', { name: 'Excluir selecionados (61)', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Excluir lançamentos', exact: true })
      await expect(dialog.getByRole('list', { name: 'Lançamentos selecionados' }).locator('li')).toHaveCount(61)
      if (process.env.FINANCE_QA_SHOTS) await page.screenshot({ path: `/tmp/finance-dialog-${width}.png`, animations: 'disabled' })
      const box = await dialog.boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.height <= 844 - 30)
      await dialog.getByRole('button', { name: 'Voltar', exact: true }).click()
      assert.equal((await (await context.request.get(`${base}/api/finance`)).json()).entries.length, 61)
    }
    // Hidden selections must never enter a destructive batch.
    await page.getByLabel('Filtrar lançamentos por coluna').getByRole('button', { name: 'Descrição / favorecido', exact: true }).click()
    await page.getByLabel('Filtrar: Descrição / favorecido', { exact: true }).fill('Zig antiga')
    await expect(page.getByRole('button', { name: 'Excluir selecionados (60)', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Vincular evento às selecionadas', exact: true }).click()
    const link = page.getByRole('dialog', { name: 'Vincular evento', exact: true })
    await expect(link.getByLabel('Evento para vincular', { exact: true })).toBeVisible()
    await link.getByRole('button', { name: 'Voltar', exact: true }).click()
    await page.getByRole('button', { name: 'Excluir selecionados (60)', exact: true }).click()
    await page.getByRole('dialog', { name: 'Excluir lançamentos', exact: true }).getByRole('button', { name: 'Confirmar exclusão de 60', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '60 lançamento(s) excluído(s)' })).toBeVisible()
    const ledger = await (await context.request.get(`${base}/api/finance`)).json()
    assert.equal(ledger.entries.length, 1)
    assert.equal(ledger.entries[0].description, 'Preservar fora do filtro')
    await page.getByLabel('Filtrar: Descrição / favorecido', { exact: true }).fill('')
    await page.getByRole('button', { name: 'Excluir Preservar fora do filtro', exact: true }).click()
    await page.getByRole('dialog', { name: 'Excluir lançamentos', exact: true }).getByRole('button', { name: 'Confirmar exclusão de 1', exact: true }).click()
    await expect(list.locator('tbody tr')).toHaveCount(0)
    const { readdir } = await import('node:fs/promises')
    const backups = await readdir(env.VERDANT_BACKUP_DIR)
    assert.equal(backups.filter(name => name.startsWith('finance-delete-')).length, 2)
    const original = await Promise.all(backups.map(async file => JSON.parse(await readFile(path.join(env.VERDANT_BACKUP_DIR, file), 'utf8'))))
    assert.ok(original.some(backup => backup.finance.entries.length === 61 && backup.ids.length === 60))
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    child.kill('SIGTERM')
    await once(child, 'exit')
    await rm(directory, { recursive: true, force: true })
  }
})
