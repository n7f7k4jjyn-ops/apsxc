import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from 'playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('event workflow and touch navigation across desktop, tablet and mobile', { timeout: 180000 }, async () => {
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
  let browser, page
  const capture = async name => {
    if (!page || !process.env.NAV_QA_ARTIFACT_DIR) return
    await mkdir(process.env.NAV_QA_ARTIFACT_DIR, { recursive: true })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(process.env.NAV_QA_ARTIFACT_DIR, `${name}.png`), fullPage: page.viewportSize().width >= 768 })
  }
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(`${base}/api/health`)).ok } catch { /* Server is starting. */ }
      if (ready) break
      await delay(100)
    }
    assert.ok(ready, `Local server must start: ${logs}`)
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu'] } : {}) })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    assert.equal((await context.request.post(`${base}/api/auth/login`, {
      data: { username: 'qa-navigation', password },
    })).status(), 200)
    page = await context.newPage()
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
    const eventChooser = djDialog.getByRole('combobox', { name: 'Evento dos DJs', exact: true })
    await expect(eventChooser).toHaveValue(event.id)
    const linkedDjs = data.people.filter(person => person.kind === 'DJ' && person.eventIds.includes(event.id))
    for (const person of linkedDjs) await djDialog.getByLabel(`Pista de ${person.name}`, { exact: true }).selectOption('SKY')
    const firstDj = linkedDjs[0]
    await djDialog.getByLabel(`Primeiro horário de ${firstDj.name}`, { exact: true }).fill('23:00')
    await djDialog.getByLabel(`Segundo horário de ${firstDj.name}`, { exact: true }).fill('03:00')
    page.once('dialog', dialog => dialog.dismiss())
    await eventChooser.selectOption('')
    await expect(eventChooser).toHaveValue(event.id)
    await expect(djDialog.getByLabel(`Segundo horário de ${firstDj.name}`, { exact: true })).toHaveValue('03:00')
    await djDialog.getByRole('button', { name: 'Salvar line', exact: true }).click()
    await expect.poll(async () => { const saved = await (await context.request.get(`${base}/api/state`)).json(); return saved.people.find(person => person.id === firstDj.id)?.eventDetails[event.id]?.secondTime }).toBe('03:00')
    await eventChooser.selectOption('')
    await expect(eventChooser).toHaveValue('')
    await eventChooser.selectOption(event.id)
    await expect(djDialog.getByLabel(`Primeiro horário de ${firstDj.name}`, { exact: true })).toHaveValue('23:00')
    await expect(djDialog.getByLabel(`Segundo horário de ${firstDj.name}`, { exact: true })).toHaveValue('03:00')

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
        if (width === 390 && title === 'DJs') await capture('relatorios-djs-mobile')
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
          const bottom = page.getByRole('navigation', { name: 'Navegação mobile' })
          await expect(bottom).toBeVisible()
          assert.ok((await bottom.boundingBox()).height >= 56)
          assert.ok((await page.locator('header[data-app-header]').boundingBox()).height < 140)
          for (const control of await page.locator('main [data-slot="button"]:visible, main .verdant-column-filter-trigger:visible, main .verdant-calendar-day:visible').all()) {
            assert.ok((await control.boundingBox()).height >= 44, `Touch target: ${await control.textContent()}`)
          }
        } else {
          await expect(page.getByRole('navigation', { name: 'Navegação mobile' })).toBeHidden()
        }
      }
    }
    await page.goto(`${base}/verdant/formularios`)
    const formCards = page.locator('.verdant-form-card-grid .verdant-export-card')
    await expect(formCards).toHaveCount(8)
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (let i = 0; i < await formCards.count(); i++) {
        const trigger = formCards.nth(i).getByRole('button')
        await trigger.click()
        const dialog = page.getByRole('dialog')
        await expect(dialog.getByText('Logo do formulário', { exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Salvar texto do formulário', exact: true })).toBeVisible()
        if (width === 390 && i === 0) await capture('formularios-mobile')
        const box = await dialog.boundingBox()
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, 'Form dialog must fit viewport')
        await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
        await expect(dialog).toBeHidden()
        await expect(trigger).toBeFocused()
      }
    }
    await page.getByRole('button', { name: 'Configurar Trabalhe conosco', exact: true }).click()
    const formDialog = page.getByRole('dialog', { name: 'Trabalhe conosco', exact: true })
    const description = formDialog.getByLabel('Texto principal do formulário', { exact: true })
    const originalDescription = await description.inputValue()
    await description.fill('Rascunho de teste não salvo')
    const rejectClose = page.waitForEvent('dialog')
    const escape = page.keyboard.press('Escape')
    await (await rejectClose).dismiss()
    await escape
    await expect(description).toHaveValue('Rascunho de teste não salvo')
    const acceptClose = page.waitForEvent('dialog')
    const closeForm = formDialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await (await acceptClose).accept()
    await closeForm
    await expect(formDialog).toBeHidden()
    await page.getByRole('button', { name: 'Configurar Trabalhe conosco', exact: true }).click()
    await expect(formDialog.getByLabel('Texto principal do formulário', { exact: true })).toHaveValue(originalDescription)
    await formDialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await formCards.nth(2).getByRole('button').click()
    await page.getByRole('dialog').locator('.verdant-config-card summary').first().click()
    await page.getByRole('button', { name: 'Configurar obrigatoriedade', exact: true }).first().click()
    await expect(page.getByRole('region', { name: 'Campos obrigatórios', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Concluir', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Campos obrigatórios', exact: true })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click()
    // Selecting a month alone must include only events of that month, not submission dates.
    await page.goto(`${base}/verdant/inscricoes`)
    await page.getByLabel('Mês', { exact: true }).fill('2026-09')
    await expect(page.getByRole('status').filter({ hasText: 'inscrição(ões)' })).toContainText('1 inscrição(ões)')
    await expect(page.getByText('Pessoa de teste 1', { exact: true })).toBeVisible()
    await page.getByLabel('Mês', { exact: true }).fill('2026-10')
    await expect(page.getByText('Pessoa de teste 0', { exact: true })).toBeVisible()
    await expect(page.getByText('Pessoa de teste 1', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Limpar mês', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'inscrição(ões)' })).toContainText('2 inscrição(ões)')
    await page.goto(`${base}/verdant/listas`)
    await page.getByLabel('Mês', { exact: true }).fill('2026-09')
    await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThan(0)
    for (const cell of await page.locator('tbody tr td:first-child').all()) assert.ok((await cell.textContent()).includes('/09/2026'))
    await page.goto(`${base}/verdant/exportacoes`)
    await page.getByLabel('Mês', { exact: true }).fill('2026-09')
    await expect(page.getByRole('combobox', { name: 'Evento dos relatórios', exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Abrir Lista geral · 2026-09', exact: true }).click()
    const monthlyDialog = page.getByRole('dialog', { name: 'Lista geral · 2026-09', exact: true })
    const csvDownload = page.waitForEvent('download')
    await monthlyDialog.getByRole('button', { name: 'Exportar CSV', exact: true }).click()
    const csv = await readFile(await (await csvDownload).path(), 'utf8')
    assert.ok(csv.includes('Pessoa de teste 1'))
    assert.ok(!csv.includes('Pessoa de teste 0'))
    await monthlyDialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir Lista de portaria', exact: true }).click()
    const monthlyPdf = page.waitForEvent('download')
    await page.getByRole('dialog').getByRole('button', { name: 'Gerar PDF', exact: true }).click()
    const pdfFile = await monthlyPdf
    assert.ok(pdfFile.suggestedFilename().includes('2026-09'))
    assert.equal((await readFile(await pdfFile.path())).subarray(0, 4).toString(), '%PDF')
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.getByLabel('Mês', { exact: true }).fill('2026-10')
    await page.getByRole('button', { name: 'Abrir Lista de portaria', exact: true }).click()
    const freeCsvDownload = page.waitForEvent('download')
    await page.getByRole('dialog').getByRole('button', { name: 'Exportar CSV', exact: true }).click()
    const freeCsv = await readFile(await (await freeCsvDownload).path(), 'utf8')
    assert.ok(freeCsv.includes('LISTA FREE') && freeCsv.includes('Pessoa de teste 0'), 'Free entries must be included in the door report')
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.goto(`${base}/verdant/financeiro`)
    await page.locator('.finance-period-details > summary').first().click()
    await page.getByLabel('Mês', { exact: true }).fill('2024-02')
    await expect(page.getByLabel('Data inicial', { exact: true })).toHaveValue('2024-02-01')
    await expect(page.getByLabel('Data final', { exact: true })).toHaveValue('2024-02-29')
    await page.goto(`${base}/verdant/escalas`)
    await page.getByLabel('Mês', { exact: true }).fill('2026-09')
    await expect(page.getByRole('region', { name: 'Calendário de escalas' })).toContainText('setembro de 2026')
    await page.goto(`${base}/apps`)
    await page.getByRole('button', { name: 'Configurar Gmail', exact: true }).click()
    const gmailDialog = page.getByRole('dialog', { name: 'Gmail', exact: true })
    const gmailField = gmailDialog.getByLabel('Gmail: e-mail de contato', { exact: true })
    await expect(gmailField).toBeVisible()
    const previousEmail = await gmailField.inputValue()
    await gmailField.fill('rascunho@example.com')
    const rejectAppClose = page.waitForEvent('dialog')
    const closeAppAttempt = gmailDialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await (await rejectAppClose).dismiss()
    await closeAppAttempt
    await expect(gmailField).toHaveValue('rascunho@example.com')
    const acceptAppClose = page.waitForEvent('dialog')
    const discardApp = gmailDialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await (await acceptAppClose).accept()
    await discardApp
    await page.getByRole('button', { name: 'Configurar Gmail', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Gmail', exact: true }).getByLabel('Gmail: e-mail de contato', { exact: true })).toHaveValue(previousEmail)
    await page.getByRole('dialog', { name: 'Gmail', exact: true }).getByRole('button', { name: 'Fechar', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Abrir Zig', exact: true })).toHaveCount(0)
    await page.goto(base)
    await expect(page.getByRole('region', { name: 'Indicadores da operação' })).toBeVisible()
    const summaryFilters = page.getByRole('group', { name: 'Filtros do resumo' })
    if (!(await summaryFilters.evaluate((element) => element.open))) await summaryFilters.locator('summary').click()
    await page.locator('.summary-main-filters select').first().selectOption(event.id)
    await page.getByRole('button', { name: 'Ver listas do evento', exact: true }).click()
    const eventLists = page.getByRole('dialog', { name: 'Listas do evento', exact: true })
    await expect(eventLists).toBeVisible()
    await expect(eventLists.getByRole('link', { name: /^Link público:/ })).toHaveCount(6)
    await eventLists.getByRole('button', { name: 'Fechar', exact: true }).click()

    const summaryEventOptions = page.locator('.summary-main-filters select').first().locator('option')
    await expect(summaryEventOptions.filter({ hasText: other.name })).toHaveCount(0)
    await page.getByRole('button', { name: 'Abrir calendário de mês', exact: true }).click()
    const monthCalendar = page.getByRole('dialog', { name: 'Calendário de mês', exact: true })
    await monthCalendar.getByRole('button', { name: 'set de 2026', exact: true }).click()
    await expect(page.getByLabel('Mês', { exact: true })).toHaveValue('2026-09')
    await expect(summaryEventOptions.filter({ hasText: other.name })).toHaveCount(1)
    await page.getByText('Personalizar período', { exact: true }).click()
    await page.getByRole('button', { name: 'Abrir calendário: Data inicial', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Calendário: Data inicial', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Data inicial', { exact: true })).toHaveValue('2026-09-01')
    await expect(page.getByLabel('Data final', { exact: true })).toHaveValue('2026-09-30')
    await page.getByText('Personalizar período', { exact: true }).click()
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Summary must fit ${width}px`)
      if (width === 390 || width === 1440) await capture(`resumo-${width}`)
      for (const title of ['Vagas e equipe', 'Últimas inscrições']) {
        const trigger = page.getByRole('button', { name: `Ver ${title.toLocaleLowerCase('pt-BR')}`, exact: true })
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: title, exact: true })
        await expect(dialog).toBeVisible()
        assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1), false, `${title} dialog must fit ${width}px`)
        await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
        await expect(trigger).toBeFocused()
      }

      for (const value of await page.locator('[data-fit-value]').all()) {
        assert.ok(await value.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Full numbers must fit their cards')
      }
    }
    await page.getByRole('button', { name: 'Resumo financeiro', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Ver comparação entre períodos', exact: true })).toBeVisible()
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Financial summary must fit ${width}px`)
      if (width === 390 || width === 1440) await capture(`financeiro-${width}`)
      await expect(page.getByRole('region', { name: 'Indicadores financeiros' }).locator('[data-fit-value]')).toHaveCount(4)
      for (const title of ['Saldos e pendências', 'Pagamentos por categoria', 'Público e listas', 'Comparação entre períodos', 'Conferência Zig']) {
        await page.getByRole('button', { name: `Ver ${title.toLocaleLowerCase('pt-BR')}`, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: title, exact: true })
        await expect(dialog).toBeVisible()
        assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1), false, `${title} dialog must fit ${width}px`)
        if (title === 'Comparação entre períodos') await expect(dialog.getByRole('table')).toBeVisible()
        await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
      }

    }
    await page.route('**/api/finance', route => route.fulfill({ json: { events: [{ id: event.id, date: event.date, name: 'EventoComNomeMuitoLongoSemEspaçosParaConferirQuebraDeTexto • Festa de teste no relatório' }], beneficiaries: [{ id: 'influencer:qa-person', name: 'InfluencerComNomeMuitoLongoSemEspaçosParaConferirLegibilidade' }], entries: [] } }))
    await page.route('**/api/finance/influencer-admissions', route => route.fulfill({ json: { registrations: [{ id: 'qa-reg', eventId: event.id, influencerId: 'qa-person' }], admissions: [] } }))
    await page.goto(`${base}/verdant/exportacoes?month=2026-10&event=${event.id}`)
    await expect(page.getByLabel('Mês', { exact: true })).toHaveValue('2026-10')
    await page.getByRole('combobox', { name: 'Evento dos relatórios', exact: true }).selectOption(event.id)
    await page.getByRole('button', { name: 'Abrir Influencers', exact: true }).click()
    const influencerDialog = page.getByRole('dialog', { name: 'Influencers', exact: true })
    await influencerDialog.getByRole('button', { name: 'Gerar relatório de repasse de influencers', exact: true }).click()
    await expect(influencerDialog.getByRole('alert')).toHaveCount(0)
    await expect(influencerDialog.locator('.verdant-influencer-payout-table tbody tr')).toHaveCount(1)
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      const cells = influencerDialog.locator('.verdant-influencer-payout-table tbody td')
      for (const cell of await cells.all()) assert.equal(await cell.evaluate(element => element.scrollWidth > element.clientWidth + 1), false, `Influencer cell must fit at ${width}px`)
      const eventBox = await cells.nth(0).boundingBox(), personBox = await cells.nth(1).boundingBox()
      assert.ok(width < 768 ? eventBox.y + eventBox.height <= personBox.y + 1 : eventBox.x + eventBox.width <= personBox.x + 1, 'Event title must not overlap influencer name')
    }
    await influencerDialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.unroute('**/api/finance')
    await page.unroute('**/api/finance/influencer-admissions')
    await page.goto(`${base}/verdant/conteudo`)
    await page.getByLabel('Mês', { exact: true }).fill('2026-09')
    await expect(page.getByText(/^setembro de 2026$/i)).toBeVisible()
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Content calendar must fit ${width}px`)
    }
    await page.goto(`${base}/apps`)
    for (const name of ['Meta Pixel', 'WhatsApp', 'Gmail', 'Telegram']) {
      await page.getByRole('button', { name: `Configurar ${name}`, exact: true }).click()
      const dialog = page.getByRole('dialog', { name, exact: true })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    }
    await page.setViewportSize({ width: 390, height: 900 })
    await page.getByRole('button', { name: 'Configurar Gmail', exact: true }).click()
    await capture('apps-mobile')
    await page.getByRole('dialog', { name: 'Gmail', exact: true }).getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.goto(`${base}/verdant/exportacoes?event=${event.id}`)
    await page.setViewportSize({ width: 375, height: 812 })
    const bottom = page.getByRole('navigation', { name: 'Navegação mobile' })
    await bottom.getByRole('button', { name: 'Mais', exact: true }).click()
    await page.getByRole('dialog', { name: 'Menu lateral' }).getByRole('link', { name: 'Listas', exact: true }).click()
    await expect(page).toHaveURL(`${base}/verdant/listas`)
    await bottom.getByRole('button', { name: 'Mais', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Menu lateral' })).toBeVisible()
    await page.getByRole('dialog').getByRole('link', { name: 'Inscrições', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Menu lateral' })).toBeHidden()
    await expect(page).toHaveURL(`${base}/verdant/inscricoes`)
    await bottom.getByRole('link', { name: 'Agenda', exact: true }).click()
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
    await bottom.getByRole('button', { name: 'Mais', exact: true }).click()
    await page.getByRole('dialog', { name: 'Menu lateral' }).getByRole('link', { name: 'Cadastros', exact: true }).click()
    await expect(page).toHaveURL(`${base}/verdant/cadastros`)
    assert.deepEqual(errors, [])
  } catch (error) {
    await capture('failure').catch(() => {})
    throw error
  } finally {
    if (browser) await browser.close()
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await exited
    await rm(directory, { recursive: true, force: true })
  }
})
