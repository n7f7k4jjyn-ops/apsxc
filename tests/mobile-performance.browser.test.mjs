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

const root = process.env.PERF_SERVER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('cold mobile summary defers workspace and optional tools', { timeout: 180000 }, async () => {
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
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-10-24T21:00:00Z'))
    const scripts = new Set()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (request.url().startsWith(base) && new URL(request.url()).pathname.endsWith('.js')) scripts.add(new URL(request.url()).pathname)
    })
    await page.goto(base)
    await expect(page.getByText('Ritmo de inscrições', { exact: true })).toBeVisible()
    await page.waitForTimeout(2200)
    const sizes = await Promise.all([...scripts].map(async file => (await readFile(path.join(root, 'dist', file))).length))
    console.log(JSON.stringify({ javascriptFiles: scripts.size, javascriptBytes: sizes.reduce((a,b) => a+b, 0) }))
    if (!process.env.PERF_SERVER_ROOT) {
      assert.ok(![...scripts].some(file => /\/(verdant|finance|rosters|registry|command-menu|financial-summary)-/.test(file)), 'Optional workspaces must not load on mobile summary')
      assert.ok(sizes.reduce((a,b) => a+b, 0) < 1000000, 'Cold mobile summary JS budget is 1 MB uncompressed')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Summary must fit the viewport')
      await page.getByRole('button', { name: /Buscar/i }).first().click()
      await expect(page.getByPlaceholder('Digite um comando ou pesquise...')).toBeVisible()
      await page.keyboard.press('Escape')
      if (process.env.MOBILE_QA_SCREENSHOT) await page.screenshot({ path: process.env.MOBILE_QA_SCREENSHOT, fullPage: true })
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    child.kill('SIGTERM')
    await once(child, 'exit')
    await rm(directory, { recursive: true, force: true })
  }
})
