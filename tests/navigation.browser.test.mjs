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

test('event workflow and touch navigation across desktop, tablet and mobile', { timeout: 120000 }, async () => {
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
  data.registrations = [event, other].map((item, index) => ({
    id: `registration-${index}`,
    eventId: item.id,
    eventName: item.name,
    eventDate: item.date,
    formKey: 'LISTA_LOVERS',
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
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    assert.equal((await context.request.post(`${base}/api/auth/login`, {
      data: { username: 'qa-navigation', password },
    })).status(), 200)
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-10-24T21:00:00Z'))
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/verdant/listas?event=${event.id}`)
    const workflow = page.getByRole('navigation', { name: 'Continuar neste evento' })
    await workflow.getByRole('link', { name: 'Inscrições', exact: true }).click()
    await expect(page).toHaveURL(`${base}/verdant/inscricoes?event=${event.id}`)
    await expect(page.getByRole('status').filter({ hasText: 'inscrição(ões)' })).toContainText('1 inscrição(ões)')
    await page.getByLabel('Buscar inscrições').fill('inexistente')
    await expect(page.getByText('Nenhuma inscrição corresponde a estes filtros.')).toBeVisible()
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).last().click()
    await expect(page.getByRole('status').filter({ hasText: 'inscrição(ões)' })).toContainText('2 inscrição(ões)')
    await page.getByRole('button', { name: 'Evento', exact: true }).click()
    await page.getByLabel('Filtrar: Evento', { exact: true }).selectOption(event.id)
    await page.getByRole('button', { name: 'Lista', exact: true }).click()
    await page.getByLabel('Filtrar: Lista', { exact: true }).selectOption('LISTA_LOVERS')
    await expect(page).toHaveURL(new RegExp(`event=${event.id}.*form=LISTA_LOVERS`))
    await page.getByText('Mais filtros', { exact: true }).click()
    await page.getByRole('button', { name: 'Consentimento', exact: true }).click()
    await page.getByLabel('Filtrar: Consentimento', { exact: true }).selectOption('sim')
    await expect(page.locator('.verdant-advanced-filters summary')).toContainText('(1)')
    await expect(page.getByRole('status').filter({ hasText: 'inscrição(ões)' })).toContainText('0 inscrição(ões)')
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).first().click()
    assert.equal(new URL(page.url()).searchParams.get('event'), '')
    assert.equal(new URL(page.url()).searchParams.get('form'), '')
    await expect(page.getByRole('status').filter({ hasText: 'inscrição(ões)' })).toContainText('2 inscrição(ões)')
    await page.getByLabel('Filtrar: Evento', { exact: true }).selectOption(event.id)
    await workflow.getByRole('link', { name: 'Relatórios', exact: true }).click()
    await expect(page).toHaveURL(`${base}/verdant/exportacoes?event=${event.id}`)
    await expect(page.getByRole('combobox', { name: 'Evento dos relatórios', exact: true })).toHaveValue(event.id)

    assert.equal(await page.locator('.verdant-export-card').count(), 6)
    await page.getByRole('button', { name: 'Abrir DJs', exact: true }).click()
    const djDialog = page.getByRole('dialog', { name: 'DJs', exact: true })
    await expect(djDialog.getByText('Convidados dos DJs', { exact: true })).toBeVisible()
    await expect(djDialog.getByText('Organizar line — pistas e horários', { exact: true })).toBeVisible()
    await expect(djDialog.getByRole('button', { name: 'Gerar PDF de convidados', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(djDialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Abrir DJs', exact: true })).toBeFocused()
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (const title of ['Lista de portaria', 'Lista geral (todos os eventos)', 'Leads com consentimento', 'DJs', 'Influencers', 'Escalas da equipe']) {
        await page.getByRole('button', { name: `Abrir ${title}`, exact: true }).click()
        const reportDialog = page.getByRole('dialog', { name: title, exact: true })
        await expect(reportDialog).toBeVisible()
        const box = await reportDialog.boundingBox()
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${title} dialog must fit viewport`)
        await reportDialog.getByRole('button', { name: 'Fechar', exact: true }).click()
        await expect(reportDialog).toBeHidden()
      }
    }

    for (const width of [320, 375, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ['agenda', 'listas', 'inscricoes', 'exportacoes']) {
        await page.goto(`${base}/verdant/${route}?event=${event.id}`)
        await expect(page.locator('main h1').first()).toBeVisible()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} must fit ${width}px`)
        if (width < 768) {
          const selector = page.getByRole('combobox', { name: 'Ir para página' })
          await expect(selector).toBeVisible()
          assert.ok((await selector.boundingBox()).height >= 44)
          assert.ok((await page.locator('header[data-app-header]').boundingBox()).height < 190)
          for (const control of await page.locator('main [data-slot="button"]:visible, main .verdant-column-filter-trigger:visible, main .verdant-calendar-day:visible').all()) {
            assert.ok((await control.boundingBox()).height >= 44, `Touch target: ${await control.textContent()}`)
          }
        } else {
          await expect(page.getByRole('combobox', { name: 'Ir para página' })).toBeHidden()
        }
      }
    }
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByRole('combobox', { name: 'Ir para página' }).selectOption('/verdant/listas')
    await expect(page).toHaveURL(`${base}/verdant/listas`)
    await page.getByRole('button', { name: 'Alternar menu lateral' }).click()
    await expect(page.getByRole('dialog', { name: 'Menu lateral' })).toBeVisible()
    await page.getByRole('dialog').getByRole('link', { name: 'Inscrições', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Menu lateral' })).toBeHidden()
    await expect(page).toHaveURL(`${base}/verdant/inscricoes`)
    await page.getByRole('combobox', { name: 'Ir para página' }).selectOption('/verdant/agenda')
    await page.getByRole('gridcell', { name: /^9, / }).click()
    await page.getByRole('button', { name: new RegExp(event.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
    const editor = page.getByRole('dialog', { name: 'Editar evento' })
    await editor.getByLabel('Nome do evento', { exact: true }).fill('Rascunho não salvo')
    const rejected = page.waitForEvent('dialog')
    const firstClick = editor.getByRole('link', { name: 'Listas', exact: true }).click()
    const prompt = await rejected
    assert.equal(prompt.type(), 'confirm')
    await prompt.dismiss()
    await firstClick
    await expect(page).toHaveURL(`${base}/verdant/agenda`)
    await expect(editor.getByLabel('Nome do evento', { exact: true })).toHaveValue('Rascunho não salvo')
    const accepted = page.waitForEvent('dialog')
    const secondClick = editor.getByRole('link', { name: 'Listas', exact: true }).click()
    await (await accepted).accept()
    await secondClick
    await expect(page).toHaveURL(`${base}/verdant/listas?event=${event.id}`)
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    await page.goto(`${base}/verdant/djs`)
    await page.getByRole('combobox', { name: 'Ir para página' }).selectOption('/verdant/cadastros')
    await expect(page).toHaveURL(`${base}/verdant/cadastros`)
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await exited
    await rm(directory, { recursive: true, force: true })
  }
})
