import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { planProductionImport, readProductionBundle } from '../src/features/verdant/production-import.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const example = {
  schemaVersion: 1,
  people: [{ id: 'import-test-dj', name: 'Artista Teste de Importação', phone: '41987654321', pixKey: 'pix-de-teste', beneficiary: 'Beneficiário Teste' }],
  team: [{ name: 'Funcionário Teste de Importação', whatsapp: '41987654322', roles: ['Bar'], availability: ['Sábado'], experience: 'Disponibilidade histórica de teste', createdAt: '2026-10-19T12:00:00-03:00' }],
  engagements: [{ id: 'import-test-gig', personId: 'import-test-dj', name: 'Artista Teste de Importação', date: '2024-01-06', event: 'Evento exclusivo de teste de importação', track: 'SKY', order: 1, time: '23:00', financialReview: [], sources: [] }],
  finance: [{ externalId: 'import-test-gig', personId: 'import-test-dj', eventKey: '2024-01-06|evento exclusivo de teste de importacao', type: 'payable', category: 'dj', description: 'Cachê de teste', amountCents: 45000, dueDate: '2024-01-06', status: 'pending', settledDate: '', paymentMethod: '', notes: 'Somente teste' }],
}

test('production import through authenticated APIs: backup, partial recovery, links, exact totals, reimport and restart', { timeout: 120000 }, async t => {
  const bundle = readProductionBundle(process.env.PRODUCTION_IMPORT_BUNDLE ? JSON.parse(await readFile(process.env.PRODUCTION_IMPORT_BUNDLE, 'utf8')) : example)
  const directory = await mkdtemp(path.join(tmpdir(), 'production-import-test-'))
  const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r))
  const port = listener.address().port; await new Promise(r => listener.close(r))
  const base = `http://127.0.0.1:${port}`
  const salt = Buffer.from('production-import-test')
  const password = 'production-import-test-password'
  const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
  const env = { ...process.env, PORT: String(port), NODE_ENV: 'test', VERDANT_SEED_TEST_STAFF: 'false', VERDANT_USERS_JSON: JSON.stringify([{ username: 'admin', role: 'admin', passwordHash }]), VERDANT_BACKUP_DIR: path.join(directory, 'backups') }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'VERDANT_ADMIN_USERNAME']) delete env[key]
  for (const key of ['DATA', 'SESSIONS', 'TASKS', 'CONTENT_PLAN', 'PREFERENCES', 'TEAM_USERS', 'CHATS', 'CUSTOMERS', 'INTEGRATIONS', 'JOB_APPLICATIONS', 'TEAM_REGISTRATIONS', 'OPERATIONS', 'FINANCE']) env[`VERDANT_${key}_FILE`] = path.join(directory, `${key.toLowerCase()}.json`)
  let child, cookie, browser
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    for (let n = 0; n < 100; n++) { try { if ((await fetch(`${base}/api/health`)).ok) return } catch { /* starting */ } await delay(50) }
    throw new Error('Servidor de teste não iniciou.')
  }
  async function stop() { if (child && child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended } }
  async function api(endpoint, body, method = 'POST') {
    const response = await fetch(base + endpoint, { headers: { Cookie: cookie || '', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { method, body: JSON.stringify(body) }) })
    const json = await response.json()
    if (!response.ok) throw Object.assign(new Error(json.error || 'Falha na API'), { status: response.status })
    return json
  }
  async function snapshot() {
    const state = await api('/api/state'), finance = await api('/api/finance'), team = []
    for (let offset = 0; ; offset += 50) { const page = await api(`/api/registry/team?offset=${offset}`); team.push(...page.records); if (team.length >= page.total) break }
    return { state, finance, team }
  }
  try {
    await start()
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) })
    assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';', 1)[0]
    if (process.env.PRODUCTION_IMPORT_BROWSER === '1') {
      await writeFile(env.VERDANT_CUSTOMERS_FILE, JSON.stringify([{id:'qa-client-a',name:'Cliente A',phone:'41999990001',email:''},{id:'qa-client-b',name:'Cliente B',phone:'41999990002',email:''}]))
      const finance = await api('/api/finance')
      await api('/api/finance', { revision: finance.revision, entries: [200, 1000].map((amountCents, index) => ({ externalId: `sort-test-${index}`, type: 'payable', category: 'general', description: index ? 'Ordenação dez' : 'Ordenação dois', counterparty: 'Fornecedor de teste', beneficiaryId: '', eventId: '', amountCents, dueDate: '2024-01-06', status: 'pending', settledDate: '', paymentMethod: '', notes: '' })) })
    }
    const before = await snapshot()
    const plan = planProductionImport(bundle, before.state, before.team, before.finance)
    assert.ok(plan.entries.length, 'Pacote deve produzir lançamentos reais de teste.')
    if (process.env.PRODUCTION_IMPORT_BROWSER === '1') {
      const { chromium } = await import('playwright')
      browser = await chromium.launch({ headless: true })
      const context = await browser.newContext()
      await context.addCookies([{ name: 'verdant_session', value: cookie.slice(cookie.indexOf('=') + 1), url: base }])
      const page = await context.newPage()
      await page.goto(`${base}/verdant/financeiro`)
      await page.getByRole('heading', { name: 'Importar produção e equipe' }).waitFor()
      await page.getByLabel('Pacote de produção').setInputFiles({ name: 'importacao.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) })
      await page.route('**/api/finance/production-backup', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Backup indisponível no teste' }) }))
      await page.getByRole('button', { name: 'Criar backup e importar os registros conciliados' }).click()
      await page.getByRole('status').filter({ hasText: 'Backup indisponível no teste' }).waitFor()
      const blocked = await snapshot()
      assert.deepEqual(blocked.state, before.state)
      assert.deepEqual(blocked.finance.entries, before.finance.entries)
      assert.equal(blocked.team.length, before.team.length)
      await page.unroute('**/api/finance/production-backup')
      await page.getByRole('button', { name: 'Gerar nova prévia' }).click()
      await page.getByRole('button', { name: 'Criar backup e importar os registros conciliados' }).click()
      await page.getByRole('status').filter({ hasText: 'Concluído:' }).waitFor({ timeout: 60000 })
      await page.getByRole('button', { name: 'Gerar nova prévia' }).click()
      await page.getByText(/0 DJs novos.*0 lançamentos/).waitFor()
      assert.equal(await page.getByRole('heading', { name: 'Repasses de influencers', exact: true }).count(), 0)
      await page.getByRole('button', { name: 'Repasses de influencers', exact: true }).click()
      await page.getByRole('heading', { name: 'Repasses de influencers', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Relatório de repasses', exact: true }).click()
      assert.equal(await page.getByRole('heading', { name: 'Repasses de influencers', exact: true }).count(), 0)
      await page.getByRole('button', { name: 'Gerar relatório de repasse de influencers' }).click()
      await page.getByRole('button', { name: 'Baixar PDF para imprimir' }).waitFor()
      const reportDownload = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Baixar PDF para imprimir' }).click()
      const reportFile = await (await reportDownload).path()
      assert.ok(reportFile && (await stat(reportFile)).size > 500)
      await page.getByRole('button', { name: 'Lançamentos', exact: true }).click()
      await page.getByRole('button', { name: 'Valor', exact: true }).click()
      const ledgerTable = page.getByRole('table').filter({ has: page.getByText('Contas por vencimento', { exact: true }) })
      let ledgerRows = await ledgerTable.locator('tbody tr').allTextContents()
      assert.ok(ledgerRows[0].includes('Ordenação dois')); assert.ok(ledgerRows[1].includes('Ordenação dez'))
      await page.getByRole('button', { name: 'Valor', exact: true }).click()
      ledgerRows = await ledgerTable.locator('tbody tr').allTextContents()
      assert.ok(ledgerRows.at(-1).includes('Ordenação dois'))
      const columnFilters = page.locator('[aria-label="Filtrar lançamentos por coluna"]')
      await columnFilters.getByRole('button', { name: 'Descrição / favorecido', exact: true }).click()
      await page.getByRole('searchbox', { name: 'Filtrar: Descrição / favorecido', exact: true }).fill('Ordenação dois')
      assert.equal(await ledgerTable.locator('tbody tr').count(), 1)
      await columnFilters.getByRole('button', { name: 'Limpar', exact: true }).click()
      assert.equal(await ledgerTable.locator('tbody tr').count(), plan.entries.length + 2)
      await page.getByRole('navigation', { name: 'Navegação rápida do aplicativo' }).getByRole('link', { name: 'Resumo', exact: true }).click()
      await page.getByRole('button', { name: 'Resumo financeiro', exact: true }).click()
      await page.getByRole('heading', { name: 'Comparação entre períodos' }).waitFor()
      await page.getByLabel('Data inicial', { exact: true }).fill('2024-01-01')
      await page.getByLabel('Data final', { exact: true }).fill('2024-01-07')
      await page.getByRole('heading', { name: 'Comparação entre períodos' }).waitFor()
      await page.getByRole('button', { name: 'Resumo da operação', exact: true }).click()
      assert.equal(await page.getByLabel('Data inicial', { exact: true }).inputValue(), '2024-01-01')
      assert.equal(await page.getByLabel('Data final', { exact: true }).inputValue(), '2024-01-07')
      await page.goto(`${base}/verdant/inscricoes`)
      await page.getByRole('button', {name:'Nome / contato',exact:true}).click()
      await page.getByRole('searchbox',{name:'Filtrar: Nome / contato',exact:true}).fill('nenhum-nome-qa-123')
      await page.getByText('Nenhuma inscrição corresponde a estes filtros.').or(page.getByText('As respostas enviadas pelos formulários aparecerão aqui.')).waitFor()
      await page.getByRole('button',{name:'Limpar filtros',exact:true}).click()
      await page.goto(`${base}/verdant/listas`)
      await page.locator('.verdant-column-filter-bar').getByRole('button',{name:'Evento',exact:true}).click()
      assert.equal(await page.getByLabel('Filtrar: Evento',{exact:true}).inputValue(),'')
      await page.locator('.verdant-column-filter-bar').getByRole('button',{name:'Data',exact:true}).click()
      await page.goto(`${base}/verdant/cadastros`)
      await page.getByRole('button',{name:'Nome',exact:true}).waitFor()
      const sortedClients = page.waitForResponse(response=>response.url().includes('/api/registry/clients?')&&response.url().includes('dir=desc'))
      await page.getByRole('button',{name:'Nome',exact:true}).click()
      await sortedClients
      await page.locator('.registry-name').first().filter({hasText:'Cliente B'}).waitFor()
      assert.equal(await page.locator('.registry-name').first().textContent(),'Cliente B')
      assert.equal(await page.getByRole('navigation',{name:'Navegação rápida do aplicativo'}).getByRole('link',{name:'DJs',exact:true}).count(),0)
      await page.goto(`${base}/verdant/escalas`)
      await page.getByRole('region',{name:'Calendário de escalas'}).waitFor()
      await page.getByRole('button',{name:'Semana',exact:true}).click()
      assert.equal(await page.locator('.roster-calendar-grid > button').count(),7)
      await page.goto(`${base}/verdant/financeiro`)
      await page.getByRole('navigation',{name:'Indicadores financeiros'}).waitFor()
      assert.equal(await page.locator('.finance-period-details').first().getAttribute('open'),null)
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Financeiro não deve transbordar no celular.')
    } else {
      const backup = await api('/api/finance/production-backup', {})
      const stored = JSON.parse(await readFile(path.join(env.VERDANT_BACKUP_DIR, backup.backup), 'utf8'))
      assert.deepEqual(stored.finance.entries, before.finance.entries)
      assert.equal((await stat(path.join(env.VERDANT_BACKUP_DIR, backup.backup))).mode & 0o777, 0o600)
      await api('/api/state', plan.state, 'PUT')
      for (const person of plan.teamToCreate) await api('/api/registry/team', person)
      // Stop after one batch, then reconstruct the preview as a fresh session.
      const first = await api('/api/finance', { revision: before.finance.revision, entries: plan.entries.slice(0, 500) })
      const partial = await snapshot(), resumed = planProductionImport(bundle, partial.state, partial.team, partial.finance)
      assert.equal(resumed.newPeople, 0); assert.equal(resumed.newEvents, 0); assert.equal(resumed.teamToCreate.length, 0)
      assert.equal(resumed.entries.length, plan.entries.length - first.imported)
      let revision = partial.finance.revision
      for (let i = 0; i < resumed.entries.length; i += 500) { const saved = await api('/api/finance', { revision, entries: resumed.entries.slice(i, i + 500) }); revision = saved.revision }
      await assert.rejects(api('/api/finance', { revision: before.finance.revision, entries: plan.entries.slice(0, 1) }), e => e.status === 409)
    }
    const after = await snapshot(), again = planProductionImport(bundle, after.state, after.team, after.finance)
    assert.equal(after.finance.entries.length - before.finance.entries.length, plan.entries.length)
    assert.equal(again.newPeople, 0); assert.equal(again.newEvents, 0); assert.equal(again.teamToCreate.length, 0); assert.equal(again.entries.length, 0)
    const originals = new Map(plan.entries.map(e => [e.externalId, e]))
    const imported = after.finance.entries.filter(e => originals.has(e.externalId))
    assert.equal(imported.reduce((s, e) => s + e.amountCents, 0), plan.entries.reduce((s, e) => s + e.amountCents, 0))
    for (const entry of imported) {
      const original = originals.get(entry.externalId)
      assert.equal(entry.amountCents, original.amountCents); assert.equal(entry.status, original.status); assert.equal(entry.settledDate, original.settledDate)
      assert.ok(after.state.events.some(e => e.id === entry.eventId))
      assert.ok(after.state.people.some(p => `dj:${p.id}` === entry.beneficiaryId && p.eventIds.includes(entry.eventId)))
    }
    await stop(); await start()
    assert.deepEqual((await api('/api/finance')).entries, after.finance.entries)
    await stop()
    env.VERDANT_BACKUP_DIR = path.join(directory, 'blocked-backup')
    await writeFile(env.VERDANT_BACKUP_DIR, 'File prevents directory creation')
    await start()
    await assert.rejects(api('/api/finance/production-backup', {}), e => e.status === 500)
    assert.deepEqual((await api('/api/finance')).entries, after.finance.entries)
    t.diagnostic(JSON.stringify({ sourcePeople: bundle.people.length, sourceGigs: bundle.engagements.length, newPeople: plan.newPeople, newEvents: plan.newEvents, newTeam: plan.teamToCreate.length, entriesWritten: plan.entries.length, bindingIssues: plan.issues.length, repeatedEntries: again.entries.length, browser: process.env.PRODUCTION_IMPORT_BROWSER === '1' }))
  } catch (error) { if(browser){for(const context of browser.contexts())for(const page of context.pages())t.diagnostic((await page.locator('body').innerText()).slice(-16000))} throw error
  } finally { if (browser) await browser.close(); await stop(); await rm(directory, { recursive: true, force: true }) }
})
