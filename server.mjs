import { testStaffChanges } from './lib/test-staff.mjs'
import { validateRoster, teamStatus } from './lib/rosters.mjs'
import { applicationStatuses, registryIdentity, registryPhone, groupRegistryClients, latestTeam, promotedTeam } from './lib/registry.mjs'
import { createServer } from 'node:http'
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import mysql from 'mysql2/promise'
import { validateTeamRegistration } from './lib/team-registrations.mjs'
import { validateJobApplication, ROLES as TEAM_ROLES, DAYS as TEAM_DAYS } from './lib/job-applications.mjs'
import { migrateVerdantState } from './lib/verdant-state-migration.mjs'
import { PUBLIC_FORM_META, personalizeFormShareHtml } from './lib/public-form-meta.mjs'
import { emptyFinance, validateFinanceStore, changeFinance } from './lib/finance.mjs'
import { ZIG_BASE_URL, ZigError, createZigClient, validateToken as validZigToken } from './lib/zig-client.mjs'
import { buildZigPreview, listZigEvents, validatePreviewPeriod } from './lib/zig-preview.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(root, 'dist')
const seedPath = path.join(root, 'src', 'features', 'verdant', 'seed.json')
const dataPath = process.env.VERDANT_DATA_FILE || path.join(root, 'storage', 'verdant.json')
const tasksPath = process.env.VERDANT_TASKS_FILE || path.join(root, 'storage', 'tasks.json')
const contentPlanPath = process.env.VERDANT_CONTENT_PLAN_FILE || path.join(root, 'storage', 'content-plan.json')
const preferencesPath = process.env.VERDANT_PREFERENCES_FILE || path.join(root, 'storage', 'preferences.json')
const teamUsersPath = process.env.VERDANT_TEAM_USERS_FILE || path.join(root, 'storage', 'team-users.json')
const chatsPath = process.env.VERDANT_CHATS_FILE || path.join(root, 'storage', 'chats.json')
const customersPath = process.env.VERDANT_CUSTOMERS_FILE || path.join(root, 'storage', 'customers.json')
const sessionsPath = process.env.VERDANT_SESSIONS_FILE || path.join(root, 'storage', 'sessions.json')
const integrationsPath = process.env.VERDANT_INTEGRATIONS_FILE || path.join(root, 'storage', 'integrations.json')
const jobApplicationsPath = process.env.VERDANT_JOB_APPLICATIONS_FILE || path.join(root, 'storage', 'job-applications.json')
let jobApplicationQueue = Promise.resolve()
const teamRegistrationsPath = process.env.VERDANT_TEAM_REGISTRATIONS_FILE || path.join(root, 'storage', 'team-registrations.json')
let teamRegistrationQueue = Promise.resolve()
const operationsPath = process.env.VERDANT_OPERATIONS_FILE || path.join(root,'storage','operations.json')
const financePath = process.env.VERDANT_FINANCE_FILE || path.join(root, 'storage', 'finance.json')
let financeQueue = Promise.resolve()
let operationsQueue = Promise.resolve()
const port = Number(process.env.PORT || 3000)
const scrypt = promisify(scryptCallback)
const SESSION_COOKIE = 'verdant_session'
const MASTER_ADMIN_EMAIL = 'brn@scopedeal.com.br'
const MASTER_ADMIN_USERNAME = 'eibrnof'
const USER_ROLES = new Set(['admin', 'operator', 'viewer'])
const ROLE_CAPABILITIES = {
  admin: new Set(['*']),
  operator: new Set([
    'business:read',
    'business:write',
    'customers:read',
    'customers:import',
    'tasks:read',
    'tasks:write',
    'preferences:read',
    'preferences:write',
    'team:assignees',
    'team:chat',
  ]),
  viewer: new Set([
    'business:read',
    'customers:read',
    'tasks:read',
    'preferences:read',
    'team:assignees',
  ]),
}
const SESSION_TTL = 12 * 60 * 60 * 1000
const REMEMBERED_SESSION_TTL = 30 * 24 * 60 * 60 * 1000
const STATE_BODY_LIMIT_BYTES = 25 * 1024 * 1024
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://central.verdantcwb.com'
const PUBLIC_FORM_KEYS = { djs: 'DJS', influencers: 'INFLUENCIADORES', lover: 'LISTA_LOVERS', lovers: 'LISTA_LOVERS', vip: 'VIP', aniversario: 'ANIVERSARIO', 'entrada-gratuita': 'ENTRADA_GRATUITA' }
const INITIAL_CONTENT_PLAN = [
  { id: 'content-20261019-0900-agenda', title: 'Agenda da semana + Promo', scheduledAt: '2026-10-19T09:00:00-03:00', format: 'feed', status: 'published', event: 'AGENDA', materialUrl: 'https://drive.google.com/drive/folders/1xS1JZDjKTlkzTd1tJNlNzoAjSbum2B7h', notes: 'Carrossel semanal.' },
  { id: 'content-20261019-1800-gostoso', title: 'GOSTOSO • Line-up completo', scheduledAt: '2026-10-19T18:00:00-03:00', format: 'reels', status: 'planned', event: 'GOSTOSO', materialUrl: 'https://drive.google.com/drive/folders/1yUkm6lxdE680SAD_m1tarw-c8UvJ2WB1' },
  { id: 'content-20261020-1800-modo', title: 'MODO F*NK • Line-up completo', scheduledAt: '2026-10-20T18:00:00-03:00', format: 'feed', status: 'planned', event: 'MODO F*NK', materialUrl: 'https://drive.google.com/drive/folders/1C5xUoAth3NHnWNKyDHC6ezGwZTWog5LP' },
  { id: 'content-20261020-1900-modo1', title: 'MODO F*NK • Wallas + Pabis', scheduledAt: '2026-10-20T19:00:00-03:00', format: 'stories', status: 'planned', event: 'MODO F*NK', materialUrl: 'https://drive.google.com/drive/folders/1C5xUoAth3NHnWNKyDHC6ezGwZTWog5LP' },
  { id: 'content-20261020-2000-modo2', title: 'MODO F*NK • Rafa Blaky + Dubiong', scheduledAt: '2026-10-20T20:00:00-03:00', format: 'stories', status: 'planned', event: 'MODO F*NK', materialUrl: 'https://drive.google.com/drive/folders/1C5xUoAth3NHnWNKyDHC6ezGwZTWog5LP' },
  { id: 'content-20261020-2100-halloween', title: 'HALLOWEEN 31/10 • Line-up completo', scheduledAt: '2026-10-20T21:00:00-03:00', format: 'reels', status: 'planned', event: 'HALLOWEEN', materialUrl: 'https://drive.google.com/drive/folders/1vSwUsUFiuf72Zo4H5nPtc1B1VkqpOWa_' },
  { id: 'content-20261021-1800-frenetika', title: 'FRENÉTIKA • Line-up completo SKY + LAND', scheduledAt: '2026-10-21T18:00:00-03:00', format: 'feed', status: 'planned', event: 'FRENÉTIKA', materialUrl: 'https://drive.google.com/drive/folders/1BnPOQqceApLFHX6xiUDqsQILqK-0N_6e' },
  { id: 'content-20261021-1900-frenetika1', title: 'FRENÉTIKA • 2 DJs individuais', scheduledAt: '2026-10-21T19:00:00-03:00', format: 'stories', status: 'planned', event: 'FRENÉTIKA', materialUrl: 'https://drive.google.com/drive/folders/1BnPOQqceApLFHX6xiUDqsQILqK-0N_6e' },
  { id: 'content-20261021-2000-frenetika2', title: 'FRENÉTIKA • 3 DJs individuais', scheduledAt: '2026-10-21T20:00:00-03:00', format: 'stories', status: 'planned', event: 'FRENÉTIKA', materialUrl: 'https://drive.google.com/drive/folders/1BnPOQqceApLFHX6xiUDqsQILqK-0N_6e' },
  { id: 'content-20261021-2100-frenetika3', title: 'FRENÉTIKA • 3 DJs individuais', scheduledAt: '2026-10-21T21:00:00-03:00', format: 'stories', status: 'planned', event: 'FRENÉTIKA', materialUrl: 'https://drive.google.com/drive/folders/1BnPOQqceApLFHX6xiUDqsQILqK-0N_6e' },
  { id: 'content-20261022-1000-modo', title: 'MODO F*NK • É HOJE', scheduledAt: '2026-10-22T10:00:00-03:00', format: 'stories', status: 'planned', event: 'MODO F*NK', materialUrl: 'https://drive.google.com/drive/folders/1C5xUoAth3NHnWNKyDHC6ezGwZTWog5LP' },
  { id: 'content-20261022-1400-modo', title: 'MODO F*NK • Line-up + informações', scheduledAt: '2026-10-22T14:00:00-03:00', format: 'stories', status: 'planned', event: 'MODO F*NK', materialUrl: 'https://drive.google.com/drive/folders/1C5xUoAth3NHnWNKyDHC6ezGwZTWog5LP' },
  { id: 'content-20261022-1800-ressaka', title: 'RESSAKA • Line-up completo', scheduledAt: '2026-10-22T18:00:00-03:00', format: 'feed', status: 'planned', event: 'RESSAKA', materialUrl: 'https://drive.google.com/drive/folders/1vZrV4b-Zrjo0iCJ9q2GE9XrIm8UjEJEr' },
  { id: 'content-20261022-1900-ressaka1', title: 'RESSAKA • Matz + Tejs Gui', scheduledAt: '2026-10-22T19:00:00-03:00', format: 'stories', status: 'planned', event: 'RESSAKA', materialUrl: 'https://drive.google.com/drive/folders/1vZrV4b-Zrjo0iCJ9q2GE9XrIm8UjEJEr' },
  { id: 'content-20261022-2000-ressaka2', title: 'RESSAKA • Andre Gazza + Yasmin Carraroh', scheduledAt: '2026-10-22T20:00:00-03:00', format: 'stories', status: 'planned', event: 'RESSAKA', materialUrl: 'https://drive.google.com/drive/folders/1vZrV4b-Zrjo0iCJ9q2GE9XrIm8UjEJEr' },
  { id: 'content-20261023-1000-frenetika', title: 'FRENÉTIKA • É HOJE', scheduledAt: '2026-10-23T10:00:00-03:00', format: 'stories', status: 'planned', event: 'FRENÉTIKA', materialUrl: 'https://drive.google.com/drive/folders/1BnPOQqceApLFHX6xiUDqsQILqK-0N_6e' },
  { id: 'content-20261023-1400-frenetika', title: 'FRENÉTIKA • Line-up + informações', scheduledAt: '2026-10-23T14:00:00-03:00', format: 'stories', status: 'planned', event: 'FRENÉTIKA', materialUrl: 'https://drive.google.com/drive/folders/1BnPOQqceApLFHX6xiUDqsQILqK-0N_6e' },
  { id: 'content-20261023-1800-gostoso1', title: 'GOSTOSO • 3 DJs individuais', scheduledAt: '2026-10-23T18:00:00-03:00', format: 'stories', status: 'planned', event: 'GOSTOSO', materialUrl: 'https://drive.google.com/drive/folders/1yUkm6lxdE680SAD_m1tarw-c8UvJ2WB1' },
  { id: 'content-20261023-1900-gostoso2', title: 'GOSTOSO • 3 DJs individuais', scheduledAt: '2026-10-23T19:00:00-03:00', format: 'stories', status: 'planned', event: 'GOSTOSO', materialUrl: 'https://drive.google.com/drive/folders/1yUkm6lxdE680SAD_m1tarw-c8UvJ2WB1' },
  { id: 'content-20261023-2000-gostoso3', title: 'GOSTOSO • 3 DJs individuais', scheduledAt: '2026-10-23T20:00:00-03:00', format: 'stories', status: 'planned', event: 'GOSTOSO', materialUrl: 'https://drive.google.com/drive/folders/1yUkm6lxdE680SAD_m1tarw-c8UvJ2WB1' },
  { id: 'content-20261024-1000-gostoso', title: 'GOSTOSO • É HOJE', scheduledAt: '2026-10-24T10:00:00-03:00', format: 'stories', status: 'planned', event: 'GOSTOSO', materialUrl: 'https://drive.google.com/drive/folders/1yUkm6lxdE680SAD_m1tarw-c8UvJ2WB1' },
  { id: 'content-20261024-1400-gostoso', title: 'GOSTOSO • Line-up + informações', scheduledAt: '2026-10-24T14:00:00-03:00', format: 'stories', status: 'planned', event: 'GOSTOSO', materialUrl: 'https://drive.google.com/drive/folders/1yUkm6lxdE680SAD_m1tarw-c8UvJ2WB1' },
  { id: 'content-20261024-1800-ressaka', title: 'RESSAKA • Amanhã / última chamada', scheduledAt: '2026-10-24T18:00:00-03:00', format: 'stories', status: 'planned', event: 'RESSAKA', materialUrl: 'https://drive.google.com/drive/folders/1vZrV4b-Zrjo0iCJ9q2GE9XrIm8UjEJEr' },
  { id: 'content-20261025-1000-ressaka', title: 'RESSAKA • É HOJE', scheduledAt: '2026-10-25T10:00:00-03:00', format: 'stories', status: 'planned', event: 'RESSAKA', materialUrl: 'https://drive.google.com/drive/folders/1vZrV4b-Zrjo0iCJ9q2GE9XrIm8UjEJEr' },
  { id: 'content-20261025-1400-ressaka', title: 'RESSAKA • Line-up + informações', scheduledAt: '2026-10-25T14:00:00-03:00', format: 'stories', status: 'planned', event: 'RESSAKA', materialUrl: 'https://drive.google.com/drive/folders/1vZrV4b-Zrjo0iCJ9q2GE9XrIm8UjEJEr' },
  { id: 'content-20261025-1900-agenda', title: 'Agenda da próxima semana', scheduledAt: '2026-10-25T19:00:00-03:00', format: 'stories', status: 'planned', event: 'AGENDA', materialUrl: 'https://drive.google.com/drive/folders/1vSwUsUFiuf72Zo4H5nPtc1B1VkqpOWa_' },
  { id: 'content-20261025-1915-highlight', title: 'Atualizar Destaque PROGRAMAÇÃO', scheduledAt: '2026-10-25T19:15:00-03:00', format: 'highlight', status: 'planned', event: 'AGENDA', materialUrl: 'https://drive.google.com/drive/folders/1vSwUsUFiuf72Zo4H5nPtc1B1VkqpOWa_' },
]
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon',
}

let currentState
let currentStateLoad = null
let writeQueue = Promise.resolve()
let stateMutationQueue = Promise.resolve()
let sessionMutationQueue = Promise.resolve()
let teamUserMutationQueue = Promise.resolve()
let chatMutationQueue = Promise.resolve()
let mysqlPool = null
const mysqlConfigured = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].some((key) => Boolean(String(process.env[key] || '').trim()))
let mysqlStartupState = mysqlConfigured ? 'starting' : 'json'

function jsonStoreKey(filePath) {
  const resolved = path.resolve(filePath)
  if (resolved === path.resolve(financePath)) return 'finance'
  if (resolved === path.resolve(operationsPath)) return 'operations'
  if (resolved === path.resolve(dataPath)) return 'verdant_state'
  if (resolved === path.resolve(tasksPath)) return 'tasks'
  if (resolved === path.resolve(contentPlanPath)) return 'content_plan'
  if (resolved === path.resolve(preferencesPath)) return 'preferences'
  if (resolved === path.resolve(teamUsersPath)) return 'team_users'
  if (resolved === path.resolve(chatsPath)) return 'team_chats'
  if (resolved === path.resolve(integrationsPath)) return 'integrations'
  if (resolved === path.resolve(customersPath)) return 'customers_legacy'
  return ''
}

async function readJsonFileFromDisk(filePath, fallback) {
  let contents
  try {
    contents = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
  try {
    return JSON.parse(contents)
  } catch (cause) {
    const error = new Error(`O arquivo de dados "${path.relative(root, filePath)}" contém JSON inválido. O servidor preservou o arquivo e não o substituirá automaticamente.`)
    error.status = 500
    error.cause = cause
    throw error
  }
}

async function readJsonFile(filePath, fallback) {
  const storeKey = jsonStoreKey(filePath)
  if (mysqlPool && storeKey && storeKey !== 'customers_legacy') {
    const [rows] = await mysqlPool.execute('SELECT payload FROM verdant_app_data WHERE store_key = ?', [storeKey])
    return rows.length ? JSON.parse(rows[0].payload) : fallback
  }
  if (mysqlPool && storeKey === 'customers_legacy') {
    const [rows] = await mysqlPool.query('SELECT payload FROM verdant_customers ORDER BY updated_at DESC')
    return rows.map((row) => JSON.parse(row.payload))
  }
  return readJsonFileFromDisk(filePath, fallback)
}

function writeJsonFile(filePath, value) {
  const storeKey = jsonStoreKey(filePath)
  const json = JSON.stringify(value)
  const operation = writeQueue.then(async () => {
    if (mysqlPool && storeKey && storeKey !== 'customers_legacy') {
      await mysqlPool.execute(
        'INSERT INTO verdant_app_data (store_key, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP',
        [storeKey, json],
      )
      return
    }
    if (mysqlPool && storeKey === 'customers_legacy') {
      const items = Array.isArray(value) ? value : []
      const connection = await mysqlPool.getConnection()
      try {
        await connection.beginTransaction()
        for (const item of items) await saveCustomerRecord(connection, item)
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
      return
    }
    await mkdir(path.dirname(filePath), { recursive: true })
    const temporary = `${filePath}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8')
    await rename(temporary, filePath)
  })
  writeQueue = operation.catch(() => {})
  return operation
}

function queueStateMutation(operation) {
  const result = stateMutationQueue.then(operation, operation)
  stateMutationQueue = result.catch(() => {})
  return result
}

const CONTENT_EVENT_BRIEFS = {
  'MODO F*NK': {
    eventPageUrl: 'https://www.verdantcwb.com/modo-funk',
    djHandles: '@wallasssssssssss · @gabrielpabis · @rafablaky · @dubiongdj',
    instagramCaption: '💥 MODO F*NK • 22.10 • 22H\n\nQuinta é noite de Pop, Funk e Megafunk na Verdant.\n\n🎧 @wallasssssssssss · @gabrielpabis · @rafablaky · @dubiongdj\n\n📍 Verdant Curitiba — Rua Dr. Claudino dos Santos, 126\n🔞 Entrada somente para maiores de 18 anos.\n\nSaiba mais: www.verdantcwb.com/modo-funk',
    facebookCaption: 'MODO F*NK acontece quinta, 22/10, a partir das 22h, na Verdant Curitiba, com @wallasssssssssss, @gabrielpabis, @rafablaky e @dubiongdj.\n\n📍 Rua Dr. Claudino dos Santos, 126 — São Francisco, Curitiba/PR\n🔞 Evento para maiores de 18 anos.\n\nMais informações: www.verdantcwb.com/modo-funk',
    storyReminder: 'Compartilhar nos Stories com sticker de link “Saiba mais” → https://www.verdantcwb.com/modo-funk',
  },
  'FRENÉTIKA': {
    eventPageUrl: 'https://www.verdantcwb.com/frenetika',
    djHandles: '@dj.rozzini · @liu_rosa · @djmattlovi · @guiquinti · @djfredoofc · @diegosanfierro · @laritssabeat · @cahenardy',
    instagramCaption: '💥 FRENÉTIKA • 23.10 • 22H\n\nSexta é dia de entrar no modo FRENÉTIKA. Duas pistas, Tribal House, Pop e Funk durante a noite.\n\n🎧 SKY: @dj.rozzini · @liu_rosa · @djmattlovi · @guiquinti\n🎧 LAND: @djfredoofc · @diegosanfierro · @laritssabeat · @cahenardy\n\n📍 Verdant Curitiba — Rua Dr. Claudino dos Santos, 126\n🔞 Entrada somente para maiores de 18 anos.\n\nSaiba mais: www.verdantcwb.com/frenetika',
    facebookCaption: 'FRENÉTIKA acontece sexta, 23/10, a partir das 22h, na Verdant Curitiba. SKY: @dj.rozzini, @liu_rosa, @djmattlovi e @guiquinti. LAND: @djfredoofc, @diegosanfierro, @laritssabeat e @cahenardy.\n\n📍 Rua Dr. Claudino dos Santos, 126 — São Francisco, Curitiba/PR\n🔞 Evento para maiores de 18 anos.\n\nMais informações: www.verdantcwb.com/frenetika',
    storyReminder: 'Compartilhar nos Stories com sticker de link “Saiba mais” → https://www.verdantcwb.com/frenetika',
  },
  'GOSTOSO': {
    eventPageUrl: 'https://www.verdantcwb.com/gostoso',
    djHandles: '@oficialdjzayon · @geymagalhaes_ · @hygorpherrer · @wagnermauricio · @mauriciomperin · @mariobeckman · @lipe_lourenco · @gabrieltrevino_ · @john.wilberr',
    instagramCaption: '🔥 GOSTOSO • 24.10 • 22H\n\nSábado é noite de GOSTOSO na Verdant. Duas pistas com Tribal House, Pop e Funk.\n\n🎧 SKY: @mauriciomperin · @mariobeckman · @lipe_lourenco · @gabrieltrevino_ · @john.wilberr\n🎧 LAND: @oficialdjzayon · @geymagalhaes_ · @hygorpherrer · @wagnermauricio\n\n📍 Verdant Curitiba — Rua Dr. Claudino dos Santos, 126\n🔞 Entrada somente para maiores de 18 anos.\n\nSaiba mais: www.verdantcwb.com/gostoso',
    facebookCaption: 'GOSTOSO acontece sábado, 24/10, a partir das 22h, na Verdant Curitiba. SKY com @mauriciomperin, @mariobeckman, @lipe_lourenco, @gabrieltrevino_ e @john.wilberr. LAND com @oficialdjzayon, @geymagalhaes_, @hygorpherrer e @wagnermauricio.\n\n📍 Rua Dr. Claudino dos Santos, 126 — São Francisco, Curitiba/PR\n🔞 Evento para maiores de 18 anos.\n\nMais informações: www.verdantcwb.com/gostoso',
    storyReminder: 'Compartilhar nos Stories com sticker de link “Saiba mais” → https://www.verdantcwb.com/gostoso',
  },
  'RESSAKA': {
    eventPageUrl: 'https://www.verdantcwb.com/ressaka',
    djHandles: '@_matzdj · @tejs_gui · @djandregazza · @yasmincarraroh',
    instagramCaption: '🌈 RESSAKA • 25.10 • 19H\n\nDomingo termina a semana na pista da Verdant com RESSAKA. Pop e Funk para fechar o fim de semana.\n\n🎧 @_matzdj · @tejs_gui · @djandregazza · @yasmincarraroh\n\n📍 Verdant Curitiba — Rua Dr. Claudino dos Santos, 126\n🔞 Entrada somente para maiores de 18 anos.\n\nSaiba mais: www.verdantcwb.com/ressaka',
    facebookCaption: 'RESSAKA acontece domingo, 25/10, a partir das 19h, na Verdant Curitiba, com @_matzdj, @tejs_gui, @djandregazza e @yasmincarraroh.\n\n📍 Rua Dr. Claudino dos Santos, 126 — São Francisco, Curitiba/PR\n🔞 Evento para maiores de 18 anos.\n\nMais informações: www.verdantcwb.com/ressaka',
    storyReminder: 'Compartilhar nos Stories com sticker de link “Saiba mais” → https://www.verdantcwb.com/ressaka',
  },
  'HALLOWEEN': {
    eventPageUrl: 'https://www.verdantcwb.com/halloween',
    djHandles: '',
    instagramCaption: '🎃 HALLOWEEN • 31.10\n\nSave the date: Halloween na Verdant. Consulte a programação completa na página oficial do evento.\n\n🔞 Entrada somente para maiores de 18 anos.\n\nSaiba mais: www.verdantcwb.com/halloween',
    facebookCaption: 'Halloween na Verdant • 31/10. Consulte a programação e as informações atualizadas na página oficial do evento.\n\n🔞 Evento para maiores de 18 anos.\n\nMais informações: www.verdantcwb.com/halloween',
    storyReminder: 'Compartilhar nos Stories com sticker de link “Saiba mais” → https://www.verdantcwb.com/halloween',
  },
}

function contentBriefFor(item) {
  const raw = String(item.event || item.title || '').toUpperCase()
  const key = Object.keys(CONTENT_EVENT_BRIEFS).find((name) => raw.includes(name))
  return key ? CONTENT_EVENT_BRIEFS[key] : null
}

function enrichContentPlan(items) {
  let changed = false
  const enriched = items.map((item) => {
    const brief = contentBriefFor(item)
    if (!brief) return item
    const next = {
      ...item,
      instagramCaption: item.instagramCaption || item.caption || brief.instagramCaption,
      facebookCaption: item.facebookCaption || brief.facebookCaption,
      storyReminder: item.storyReminder || brief.storyReminder,
      eventPageUrl: item.eventPageUrl || brief.eventPageUrl,
      djHandles: item.djHandles || brief.djHandles,
      facebookEventPublished: item.facebookEventPublished ?? true,
    }
    if (JSON.stringify(next) !== JSON.stringify(item)) changed = true
    return next
  })
  return { items: enriched, changed }
}

function validContentPlanItem(value, previous = {}) {
  const formats = new Set(['feed', 'reels', 'stories', 'highlight'])
  const statuses = new Set(['planned', 'ready', 'approval', 'scheduled', 'published', 'waiting', 'progress', 'completed'])
  const clean = (field, max = 4000) => String(value?.[field] ?? previous?.[field] ?? '').trim().slice(0, max)
  const title = clean('title', 160)
  const scheduledAt = clean('scheduledAt', 64)
  const format = clean('format', 24)
  const status = clean('status', 24)
  if (!title) { const error = new Error('Informe o título da publicação.'); error.status = 400; throw error }
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) { const error = new Error('Informe data e horário válidos.'); error.status = 400; throw error }
  if (!formats.has(format)) { const error = new Error('Formato de publicação inválido.'); error.status = 400; throw error }
  if (!statuses.has(status)) { const error = new Error('Status de publicação inválido.'); error.status = 400; throw error }
  const materialUrl = clean('materialUrl', 2048)
  if (materialUrl && !/^https:\/\//i.test(materialUrl)) { const error = new Error('O link do material precisa usar HTTPS.'); error.status = 400; throw error }
  const now = new Date().toISOString()
  return {
    id: previous.id || `content-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`,
    title,
    scheduledAt,
    format,
    status,
    event: clean('event', 120),
    materialUrl,
    responsible: clean('responsible', 120),
    instagramCaption: clean('instagramCaption', 12000),
    facebookCaption: clean('facebookCaption', 12000),
    storyReminder: clean('storyReminder', 4000),
    eventPageUrl: clean('eventPageUrl', 2048),
    djHandles: clean('djHandles', 4000),
    facebookEventPublished: value?.facebookEventPublished === undefined ? Boolean(previous.facebookEventPublished) : value.facebookEventPublished === true,
    facebookEventUrl: clean('facebookEventUrl', 2048),
    caption: clean('caption', 12000),
    notes: clean('notes', 4000),
    createdAt: previous.createdAt || now,
    updatedAt: now,
  }
}

function queueSessionMutation(operation) {
  const result = sessionMutationQueue.then(operation, operation)
  sessionMutationQueue = result.catch(() => {})
  return result
}

async function initializeMySql() {
  const supplied = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].some((key) => Boolean(String(process.env[key] || '').trim()))
  if (!supplied) return
  const missing = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].filter((key) => !process.env[key])
  if (missing.length) throw new Error(`Variáveis MySQL ausentes: ${missing.join(', ')}`)
  const portValue = Number(process.env.DB_PORT || 3306)
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) throw new Error('DB_PORT inválida.')
  mysqlPool = mysql.createPool({
    host: process.env.DB_HOST,
    port: portValue,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: Math.max(2, Math.min(20, Number(process.env.DB_CONNECTION_LIMIT) || 10)),
    queueLimit: 0,
    charset: 'utf8mb4',
    decimalNumbers: true,
  })
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS verdant_app_data (
      store_key VARCHAR(64) NOT NULL PRIMARY KEY,
      payload LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS verdant_customers (
      id VARCHAR(80) NOT NULL PRIMARY KEY,
      cpf_key CHAR(11) NULL UNIQUE,
      email_key VARCHAR(254) NULL,
      phone_key VARCHAR(15) NULL,
      name VARCHAR(160) NOT NULL,
      phone VARCHAR(50) NOT NULL DEFAULT '',
      email VARCHAR(254) NOT NULL DEFAULT '',
      source_event_id VARCHAR(128) NOT NULL DEFAULT '',
      payload LONGTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_verdant_customer_name (name),
      INDEX idx_verdant_customer_email (email_key),
      INDEX idx_verdant_customer_phone (phone_key),
      INDEX idx_verdant_customer_event (source_event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS verdant_customer_sources (
      source_system VARCHAR(80) NOT NULL,
      source_id VARCHAR(128) NOT NULL,
      customer_id VARCHAR(80) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_system, source_id),
      INDEX idx_verdant_source_customer (customer_id),
      CONSTRAINT fk_verdant_source_customer FOREIGN KEY (customer_id) REFERENCES verdant_customers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS verdant_sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      username VARCHAR(80) NOT NULL,
      email VARCHAR(254) NOT NULL DEFAULT '',
      expires_at BIGINT NOT NULL,
      INDEX idx_verdant_sessions_expiration (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS verdant_job_applications (
      id VARCHAR(80) PRIMARY KEY,
      created_at VARCHAR(30) NOT NULL,
      payload LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS verdant_team_registrations (
      id VARCHAR(80) PRIMARY KEY,
      created_at VARCHAR(30) NOT NULL,
      payload LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  const stores = [
    ['verdant_state', dataPath, JSON.parse(await readFile(seedPath, 'utf8'))],
    ['tasks', tasksPath, []],
    ['preferences', preferencesPath, {}],
    ['team_users', teamUsersPath, []],
    ['team_chats', chatsPath, []],
    ['integrations', integrationsPath, {}],
    ['operations', operationsPath, {teamStatuses:{},rosters:[]}],
  ]
  for (const [key, filePath, fallback] of stores) {
    const [existing] = await mysqlPool.execute('SELECT store_key FROM verdant_app_data WHERE store_key = ?', [key])
    if (!existing.length) {
      const value = await readJsonFileFromDisk(filePath, fallback)
      await mysqlPool.execute('INSERT IGNORE INTO verdant_app_data (store_key, payload) VALUES (?, ?)', [key, JSON.stringify(value)])
    }
  }
  const [[{ total }]] = await mysqlPool.query('SELECT COUNT(*) AS total FROM verdant_customers')
  if (!Number(total)) {
    const legacyCustomers = await readJsonFileFromDisk(customersPath, [])
    if (Array.isArray(legacyCustomers)) {
      const connection = await mysqlPool.getConnection()
      try {
        await connection.beginTransaction()
        for (const [index, item] of legacyCustomers.entries()) {
          const customer = { ...item, id: String(item.id || `legacy-${index + 1}`), sourceSystem: item.sourceSystem || 'legacy-json', sourceId: String(item.sourceId || item.id || index + 1) }
          await saveCustomerRecord(connection, customer)
        }
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    }
  }
  await mysqlPool.query('SELECT 1')
}

async function seedRequestedTestStaff() {
  if (process.env.VERDANT_SEED_TEST_STAFF !== 'true') return
  if (mysqlPool) {
    const connection = await mysqlPool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.query('SELECT payload FROM verdant_team_registrations ORDER BY id FOR UPDATE')
      const changes = testStaffChanges(rows.map(row=>JSON.parse(row.payload)))
      for (const member of changes.insert) await connection.execute('INSERT IGNORE INTO verdant_team_registrations (id,created_at,payload) VALUES (?,?,?)',[member.id,member.createdAt,JSON.stringify(member)])
      for (const member of changes.update) await connection.execute('UPDATE verdant_team_registrations SET payload = ? WHERE id = ?',[JSON.stringify(member),member.id])
      await connection.commit()
    } catch(error) { await connection.rollback(); throw error } finally { connection.release() }
  } else {
    const operation = teamRegistrationQueue.then(async()=>{
      const existing = await readJsonFile(teamRegistrationsPath,[])
      const changes = testStaffChanges(existing)
      const updates = new Map(changes.update.map(row=>[row.id,row]))
      if (changes.insert.length || changes.update.length) await writeJsonFile(teamRegistrationsPath,[...changes.insert,...existing.map(row=>updates.get(row.id)||row)])
    })
    teamRegistrationQueue = operation.catch(()=>{})
    await operation
  }
}

async function cleanupTeamAndRostersOnce() {
  if (process.env.NODE_ENV === 'test') return
  const marker = 'cleanupTeamAndRosters20261019'
  if (mysqlPool) {
    const connection = await mysqlPool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute('SELECT payload FROM verdant_app_data WHERE store_key = ? FOR UPDATE', ['operations'])
      const document = rows.length ? JSON.parse(rows[0].payload) : { teamStatuses: {}, rosters: [] }
      if (document?.maintenance?.[marker]) {
        await connection.rollback()
        return
      }
      await connection.execute('DELETE FROM verdant_team_registrations')
      const next = {
        ...document,
        teamStatuses: {},
        rosters: [],
        maintenance: { ...(document.maintenance || {}), [marker]: new Date().toISOString() },
      }
      await connection.execute(
        'INSERT INTO verdant_app_data (store_key, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP',
        ['operations', JSON.stringify(next)],
      )
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    return
  }

  const document = await readJsonFile(operationsPath, { teamStatuses: {}, rosters: [] })
  if (document?.maintenance?.[marker]) return
  await writeJsonFile(teamRegistrationsPath, [])
  await writeJsonFile(operationsPath, {
    ...document,
    teamStatuses: {},
    rosters: [],
    maintenance: { ...(document.maintenance || {}), [marker]: new Date().toISOString() },
  })
}

// One locked document keeps team status and roster edits consistent across processes.
async function readOperations() { return readJsonFile(operationsPath,{teamStatuses:{},rosters:[]}) }
async function readRosterTeam() {
  if (mysqlPool) { const [rows] = await mysqlPool.query('SELECT payload FROM verdant_team_registrations ORDER BY created_at DESC, id DESC'); return latestTeam(rows.map(row=>JSON.parse(row.payload))) }
  return latestTeam(await readJsonFile(teamRegistrationsPath,[]))
}
async function financeReferences() {
  const [state, team] = await Promise.all([readState(), readRosterTeam()])
  return {
    beneficiaries: [
      ...team.map(person => ({ id: `team:${person.id}`, name: person.name, kind: 'team', ...(person.pixKey ? { pixKey: person.pixKey } : {}) })),
      ...(state.people || []).filter(person => person.kind === 'DJ').map(person => ({ id: `dj:${person.id}`, name: person.name, kind: 'dj' })),
    ],
    events: state.events.map(event => ({ id: event.id, name: event.name, date: event.date })),
  }
}

async function initializeFinanceStore() {
  if (!mysqlPool) return
  const [rows] = await mysqlPool.execute('SELECT store_key FROM verdant_app_data WHERE store_key = ?', ['finance'])
  if (rows.length) return
  const document = validateFinanceStore(await readJsonFileFromDisk(financePath, emptyFinance()))
  await mysqlPool.execute('INSERT IGNORE INTO verdant_app_data (store_key, payload) VALUES (?, ?)', ['finance', JSON.stringify(document)])
}

async function readFinanceStore() {
  await initializeFinanceStore()
  return validateFinanceStore(await readJsonFile(financePath, emptyFinance()))
}

async function mutateFinance(payload, actor, id) {
  if (mysqlPool) {
    await initializeFinanceStore()
    const references = await financeReferences()
    const connection = await mysqlPool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute('SELECT payload FROM verdant_app_data WHERE store_key = ? FOR UPDATE', ['finance'])
      const result = changeFinance(JSON.parse(rows[0].payload), payload, references, actor, id)
      await connection.execute('UPDATE verdant_app_data SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE store_key = ?', [JSON.stringify(result.document), 'finance'])
      await connection.commit()
      return result.response
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  const operation = financeQueue.then(async () => {
    const document = validateFinanceStore(await readJsonFile(financePath, emptyFinance()))
    const result = changeFinance(document, payload, await financeReferences(), actor, id)
    await writeJsonFile(financePath, result.document)
    return result.response
  })
  financeQueue = operation.catch(() => {})
  return operation
}
async function changeOperations(change) {
  if (mysqlPool) {
    const connection = await mysqlPool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute('SELECT payload FROM verdant_app_data WHERE store_key = ? FOR UPDATE',['operations'])
      const document = rows.length ? JSON.parse(rows[0].payload) : {teamStatuses:{},rosters:[]}
      const result = await change(document)
      await connection.execute('UPDATE verdant_app_data SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE store_key = ?',[JSON.stringify(document),'operations'])
      await connection.commit()
      return result
    } catch(error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  const operation = operationsQueue.then(async()=>{
    const document = await readOperations()
    const result = await change(document)
    await writeJsonFile(operationsPath,document)
    return result
  })
  operationsQueue = operation.catch(()=>{})
  return operation
}

async function saveCustomerRecord(connection, customer) {
  const sourceSystem = String(customer.sourceSystem || 'legacy-json').slice(0, 80)
  const sourceId = String(customer.sourceId || customer.id || '').slice(0, 128)
  const cpfKey = customer.cpfValid && customer.cpfKey ? String(customer.cpfKey).slice(0, 11) : null
  let persisted = customer
  const [bySource] = await connection.execute(
    `SELECT c.id, c.payload FROM verdant_customer_sources s JOIN verdant_customers c ON c.id = s.customer_id
     WHERE s.source_system = ? AND s.source_id = ? LIMIT 1`,
    [sourceSystem, sourceId],
  )
  const [byCpf] = !bySource.length && cpfKey
    ? await connection.execute('SELECT id, payload FROM verdant_customers WHERE cpf_key = ? LIMIT 1', [cpfKey])
    : [[]]
  const existingRows = bySource.length ? bySource : byCpf
  if (existingRows.length) {
    persisted = mergeCustomer(JSON.parse(existingRows[0].payload), customer)
    persisted.id = existingRows[0].id
  }
  const id = String(persisted.id || `customer-${randomBytes(12).toString('hex')}`).slice(0, 80)
  await connection.execute(
    `INSERT INTO verdant_customers (id, cpf_key, email_key, phone_key, name, phone, email, source_event_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email_key = VALUES(email_key), phone_key = VALUES(phone_key), name = VALUES(name),
       phone = VALUES(phone), email = VALUES(email), source_event_id = VALUES(source_event_id), payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
    [id, persisted.cpfValid && persisted.cpfKey ? String(persisted.cpfKey).slice(0, 11) : null, persisted.emailKey || null, persisted.phoneKey || null, String(persisted.name || '').slice(0, 160), String(persisted.phone || '').slice(0, 50), String(persisted.email || '').slice(0, 254), String(persisted.sourceEventId || '').slice(0, 128), JSON.stringify(persisted)],
  )
  if (sourceId) await connection.execute(
    'INSERT INTO verdant_customer_sources (source_system, source_id, customer_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id)',
    [sourceSystem, sourceId, id],
  )
}

async function importCustomersToMySql(sourceSystem, rows) {
  const connection = await mysqlPool.getConnection()
  let created = 0
  let updated = 0
  try {
    await connection.beginTransaction()
    for (const raw of rows) {
      const incoming = normalizeImportedCustomer(raw, sourceSystem)
      const [bySource] = await connection.execute(
        `SELECT c.id, c.payload FROM verdant_customer_sources s JOIN verdant_customers c ON c.id = s.customer_id
         WHERE s.source_system = ? AND s.source_id = ? FOR UPDATE`,
        [incoming.sourceSystem, incoming.sourceId],
      )
      let existing = bySource[0]
      if (!existing && incoming.cpfKey) {
        const [byCpf] = await connection.execute('SELECT id, payload FROM verdant_customers WHERE cpf_key = ? FOR UPDATE', [incoming.cpfKey])
        existing = byCpf[0]
      }
      if (existing) {
        const merged = mergeCustomer(JSON.parse(existing.payload), incoming)
        merged.id = existing.id
        await saveCustomerRecord(connection, merged)
        updated++
      } else {
        const customer = { ...incoming, id: `customer-${randomBytes(12).toString('hex')}`, sourceRefs: [{ system: incoming.sourceSystem, id: incoming.sourceId }] }
        await saveCustomerRecord(connection, customer)
        created++
      }
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
  const [[{ total }]] = await mysqlPool.query('SELECT COUNT(*) AS total FROM verdant_customers')
  return { created, updated, total: Number(total) }
}

function customerSortValue(customer, key) {
  if (key === 'balance') return customer.availableBalance
  return customer[key]
}

function compareCustomerValues(left, right, key) {
  const leftValue = customerSortValue(left, key)
  const rightValue = customerSortValue(right, key)
  const leftEmpty = leftValue == null || leftValue === ''
  const rightEmpty = rightValue == null || rightValue === ''
  if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1
  if (leftEmpty && rightEmpty) return 0
  if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue
  return String(leftValue).localeCompare(String(rightValue), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

async function queryCustomers(query, offset, limit, inputFilters = {}, sortKey = 'name', direction = 'asc') {
  const filters = inputFilters && typeof inputFilters === 'object'
    ? Object.fromEntries(Object.entries(inputFilters).filter(([key, value]) => customerFilterFields.has(key) && typeof value === 'string' && value.trim()).map(([key, value]) => [key, value.trim().toLowerCase().slice(0, 100)]))
    : {}
  if (!mysqlPool) {
    const records = await readJsonFile(customersPath, [])
    const filtered = records.filter((customer) => {
      if (query && !`${customer.name} ${customer.cpf} ${customer.phone} ${customer.email} ${customer.sourceEventId} ${customer.sourceSystem}`.toLowerCase().includes(query.toLowerCase())) return false
      return Object.entries(filters).every(([key, value]) => customerFilterValue(customer, key).toLowerCase().includes(value))
    })
    const sortMultiplier = direction === 'asc' ? 1 : -1
    const sorted = filtered.sort((left, right) =>
      compareCustomerValues(left, right, sortKey) * sortMultiplier
      || String(left.name ?? '').localeCompare(String(right.name ?? ''), 'pt-BR', { sensitivity: 'base' })
      || String(left.id ?? '').localeCompare(String(right.id ?? '')))
    return { total: sorted.length, customers: sorted.slice(offset, offset + limit) }
  }
  const clauses = []
  const values = []
  if (query) {
    clauses.push('CONCAT_WS(\' \', name, cpf_key, phone, email, source_event_id) LIKE ?')
    values.push(`%${query}%`)
  }
  for (const [key, value] of Object.entries(filters)) {
    clauses.push(`LOWER(${customerFilterSql[key]}) LIKE ?`)
    values.push(`%${value}%`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const [[{ total }]] = await mysqlPool.execute(`SELECT COUNT(*) AS total FROM verdant_customers ${where}`, values)
  const sortExpression = customerSortSql[sortKey]
  const sortDirection = direction === 'asc' ? 'ASC' : 'DESC'
  const [rows] = await mysqlPool.execute(`SELECT payload FROM verdant_customers ${where} ORDER BY CASE WHEN ${sortExpression} IS NULL THEN 1 ELSE 0 END ASC, ${sortExpression} ${sortDirection}, id ASC LIMIT ? OFFSET ?`, [...values, limit, offset])
  return { total: Number(total), customers: rows.map((row) => JSON.parse(row.payload)) }
}

const customerSortSql = {
  name: "LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.name')))",
  cpf: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.cpf'))",
  phone: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.phone'))",
  email: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.email'))",
  presenceCount: "CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.presenceCount')) AS DECIMAL(18,2))",
  lastVisitAt: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.lastVisitAt'))",
  balance: "CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.availableBalance')) AS DECIMAL(18,2))",
  sourceSystem: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sourceSystem'))",
}

const customerFilterSql = {
  name: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.name'))",
  cpf: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.cpf'))",
  phone: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.phone'))",
  email: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.email'))",
  presenceCount: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.presenceCount'))",
  lastVisitAt: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.lastVisitAt'))",
  balance: "CONCAT_WS(' ', JSON_UNQUOTE(JSON_EXTRACT(payload, '$.availableBalance')), JSON_UNQUOTE(JSON_EXTRACT(payload, '$.consumption')))",
  sourceSystem: "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sourceSystem'))",
}
const customerFilterFields = new Set(Object.keys(customerFilterSql))

function customerFilterValue(customer, key) {
  if (key === 'balance') return `${customer.availableBalance ?? ''} ${customer.consumption ?? ''}`
  return String(customer[key] ?? '')
}

async function readState() {
  if (currentState && !mysqlPool) return currentState
  if (currentStateLoad) return currentStateLoad
  currentStateLoad = (async () => {
    let state = await readJsonFile(dataPath, null)
    let changed = !state
    if (!state) state = JSON.parse(await readFile(seedPath, 'utf8'))
    if (!state || !Array.isArray(state.events) || !Array.isArray(state.forms) || !Array.isArray(state.people) || !Array.isArray(state.registrations)) {
      const error = new Error('O arquivo de estado da Verdant não possui a estrutura esperada. O servidor preservou os dados existentes.')
      error.status = 500
      throw error
    }
    const seed = JSON.parse(await readFile(seedPath, 'utf8'))
    const migration = migrateVerdantState(state, seed)
    state = migration.state
    changed ||= migration.changed
    if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
      state = { ...state, revision: 0 }
      changed = true
    }
    if (changed) await writeJsonFile(dataPath, state)
    currentState = state
    return state
  })()
  try {
    return await currentStateLoad
  } finally {
    currentStateLoad = null
  }
}

async function saveState(state) {
  await writeJsonFile(dataPath, state)
  currentState = state
  return state
}

async function saveStateIfRevision(state, expectedRevision) {
  if (!mysqlPool) {
    const current = await readState()
    if (current.revision !== expectedRevision) return false
    await saveState(state)
    return true
  }

  const connection = await mysqlPool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute('SELECT payload FROM verdant_app_data WHERE store_key = ? FOR UPDATE', ['verdant_state'])
    if (!rows.length) {
      await connection.rollback()
      currentState = undefined
      return false
    }
    const current = JSON.parse(rows[0].payload)
    if (Number(current.revision) !== expectedRevision) {
      await connection.rollback()
      currentState = undefined
      return false
    }
    await connection.execute(
      'UPDATE verdant_app_data SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE store_key = ?',
      [JSON.stringify(state), 'verdant_state'],
    )
    await connection.commit()
    currentState = state
    return true
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

function requestError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function digitsOnly(value) { return String(value ?? '').replace(/\D/g, '') }

function validCpf(value) {
  const cpf = digitsOnly(value)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  const digit = (length) => {
    const sum = [...cpf.slice(0, length)].reduce((total, number, index) => total + Number(number) * (length + 1 - index), 0)
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

function normalizeImportedCustomer(value, sourceSystem) {
  const sourceId = String(value.sourceId ?? '').trim().slice(0, 128)
  const name = String(value.name ?? '').trim().slice(0, 160)
  if (!sourceId || !name) {
    const error = new Error('Cada registro precisa de identificador de origem e nome.')
    error.status = 400
    throw error
  }
  const cpf = String(value.cpf ?? '').trim().slice(0, 40)
  const valid = validCpf(cpf)
  const phone = String(value.phone ?? '').trim().slice(0, 50)
  const email = String(value.email ?? '').trim().toLowerCase().slice(0, 254)
  const flags = Array.isArray(value.qualityFlags) ? value.qualityFlags.map((flag) => String(flag).slice(0, 80)).slice(0, 12) : []
  if (cpf && !valid && !flags.includes('CPF para revisão')) flags.push('CPF para revisão')
  return {
    sourceSystem: String(sourceSystem || 'verdant-export').trim().slice(0, 80), sourceId, name, cpf,
    cpfValid: valid, cpfKey: valid ? digitsOnly(cpf) : '', email,
    emailKey: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '', phone,
    phoneKey: [10, 11].includes(digitsOnly(phone).length) || (digitsOnly(phone).startsWith('55') && [12, 13].includes(digitsOnly(phone).length)) ? digitsOnly(phone) : '',
    birthday: String(value.birthday ?? '').slice(0, 32),
    presenceCount: Math.max(0, Math.min(1000000, Math.trunc(Number(value.presenceCount) || 0))),
    firstEntryAt: String(value.firstEntryAt ?? '').slice(0, 32), lastVisitAt: String(value.lastVisitAt ?? '').slice(0, 32),
    availableBalance: Math.max(0, Math.min(1_000_000_000, Number(value.availableBalance) || 0)),
    consumption: Math.max(0, Math.min(1_000_000_000, Number(value.consumption) || 0)),
    sourceEventId: String(value.sourceEventId ?? '').slice(0, 128),
    firstInteractionAt: String(value.firstInteractionAt ?? '').slice(0, 32),
    sourceSystems: String(value.sourceSystems ?? '').slice(0, 254),
    sourceIdentifiers: String(value.sourceIdentifiers ?? '').slice(0, 2000),
    nameVariants: String(value.nameVariants ?? '').slice(0, 1000),
    emailAlternates: String(value.emailAlternates ?? '').slice(0, 1000),
    phoneAlternates: String(value.phoneAlternates ?? '').slice(0, 1000),
    gender: String(value.gender ?? '').slice(0, 40),
    appActive: String(value.appActive ?? '').slice(0, 40),
    firstUse: String(value.firstUse ?? '').slice(0, 40),
    registrationLists: String(value.registrationLists ?? '').slice(0, 2000),
    registrationCount: Math.max(0, Math.min(1000000, Math.trunc(Number(value.registrationCount) || 0))),
    matchBasis: String(value.matchBasis ?? '').slice(0, 80),
    qualityFlags: flags,
    importedAt: String(value.importedAt ?? new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  }
}

function mergeCustomer(existing, incoming) {
  const merged = { ...existing }
  for (const key of ['name', 'cpf', 'email', 'phone', 'birthday', 'firstEntryAt', 'lastVisitAt', 'sourceEventId', 'firstInteractionAt', 'sourceSystems', 'sourceIdentifiers', 'nameVariants', 'emailAlternates', 'phoneAlternates', 'gender', 'appActive', 'firstUse', 'registrationLists', 'matchBasis']) {
    if (incoming[key]) merged[key] = incoming[key]
  }
  for (const key of ['presenceCount', 'availableBalance', 'consumption']) {
    if (Number.isFinite(incoming[key])) merged[key] = incoming[key]
  }
  if (Number.isFinite(incoming.registrationCount)) merged.registrationCount = Math.max(Number(existing.registrationCount) || 0, incoming.registrationCount)
  if (incoming.cpfValid) { merged.cpfValid = true; merged.cpfKey = incoming.cpfKey }
  if (incoming.emailKey) merged.emailKey = incoming.emailKey
  if (incoming.phoneKey) merged.phoneKey = incoming.phoneKey
  merged.qualityFlags = [...new Set([...(existing.qualityFlags || []), ...(incoming.qualityFlags || [])])]
  merged.sourceRefs = [...new Map([...(existing.sourceRefs || []), { system: incoming.sourceSystem, id: incoming.sourceId }].map((ref) => [`${ref.system}:${ref.id}`, ref])).values()]
  merged.updatedAt = incoming.updatedAt
  return merged
}

let customerMutationQueue = Promise.resolve()
function importCustomers(sourceSystem, rows) {
  const operation = customerMutationQueue.then(async () => {
    if (mysqlPool) return importCustomersToMySql(sourceSystem, rows)
    const current = await readJsonFile(customersPath, [])
    const records = Array.isArray(current) ? current : []
    const bySource = new Map()
    const byCpf = new Map()
    records.forEach((customer, index) => {
      const sourceKey = `source:${customer.sourceSystem}:${customer.sourceId}`
      if (customer.sourceId) bySource.set(sourceKey, index)
      if (customer.cpfKey && customer.cpfValid) byCpf.set(customer.cpfKey, index)
    })
    let created = 0
    let updated = 0
    for (const raw of rows) {
      const incoming = normalizeImportedCustomer(raw, sourceSystem)
      const sourceKey = `source:${incoming.sourceSystem}:${incoming.sourceId}`
      const index = bySource.get(sourceKey) ?? (incoming.cpfKey ? byCpf.get(incoming.cpfKey) : undefined)
      if (index === undefined) {
        const customer = { ...incoming, id: `customer-${randomBytes(12).toString('hex')}`, sourceRefs: [{ system: incoming.sourceSystem, id: incoming.sourceId }] }
        records.push(customer)
        const createdIndex = records.length - 1
        bySource.set(sourceKey, createdIndex)
        if (incoming.cpfKey) byCpf.set(incoming.cpfKey, createdIndex)
        created++
      } else {
        const customer = mergeCustomer(records[index], incoming)
        records[index] = customer
        bySource.set(sourceKey, index)
        if (customer.cpfKey) byCpf.set(customer.cpfKey, index)
        updated++
      }
    }
    await writeJsonFile(customersPath, records)
    return { created, updated, total: records.length }
  })
  customerMutationQueue = operation.catch(() => {})
  return operation
}

function cookieValue(request, name) {
  const prefix = `${name}=`
  return (request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || ''
}

function sessionTokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function storeSession(token, session) {
  const tokenHash = sessionTokenHash(token)
  if (mysqlPool) {
    await mysqlPool.execute('DELETE FROM verdant_sessions WHERE expires_at <= ?', [Date.now()])
    await mysqlPool.execute(
      'INSERT INTO verdant_sessions (token_hash, username, email, expires_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE username = VALUES(username), email = VALUES(email), expires_at = VALUES(expires_at)',
      [tokenHash, session.username, session.email || '', session.expiresAt],
    )
    return
  }
  return queueSessionMutation(async () => {
    const records = await readJsonFile(sessionsPath, {})
    for (const [key, value] of Object.entries(records)) {
      if (!value || Number(value.expiresAt) <= Date.now()) delete records[key]
    }
    records[tokenHash] = session
    await writeJsonFile(sessionsPath, records)
  })
}

async function findSession(token) {
  if (!token) return null
  const tokenHash = sessionTokenHash(token)
  let session
  if (mysqlPool) {
    const [rows] = await mysqlPool.execute('SELECT username, email, expires_at AS expiresAt FROM verdant_sessions WHERE token_hash = ? LIMIT 1', [tokenHash])
    session = rows[0] || null
  } else {
    const records = await readJsonFile(sessionsPath, {})
    session = records[tokenHash] || null
  }
  if (!session || Number(session.expiresAt) <= Date.now()) {
    if (session) await removeSession(token)
    return null
  }
  return { ...session, expiresAt: Number(session.expiresAt) }
}

async function removeSession(token) {
  if (!token) return
  const tokenHash = sessionTokenHash(token)
  if (mysqlPool) {
    await mysqlPool.execute('DELETE FROM verdant_sessions WHERE token_hash = ?', [tokenHash])
    return
  }
  return queueSessionMutation(async () => {
    const records = await readJsonFile(sessionsPath, {})
    if (Object.hasOwn(records, tokenHash)) {
      delete records[tokenHash]
      await writeJsonFile(sessionsPath, records)
    }
  })
}

async function sessionUser(request) {
  const token = cookieValue(request, SESSION_COOKIE)
  const session = await findSession(token)
  if (!session) return null
  const account = (await configuredUsers()).find((user) => String(user.username || user.loginUsername || user.email?.split('@')[0] || '').toLowerCase() === String(session.username).toLowerCase())
  if (!account || account.active === false) {
    await removeSession(token)
    return null
  }
  return { email: account.email || session.email || session.username, username: session.username, displayName: account.displayName || account.name || session.username, avatar: account.avatar || '', role: account.role, exp: session.expiresAt }
}

async function requireCapability(request, response, capability) {
  const user = await sessionUser(request)
  if (!user) {
    sendJson(response, 401, { error: 'Sessão necessária.' })
    return null
  }
  const capabilities = ROLE_CAPABILITIES[user.role]
  if (!capabilities?.has('*') && !capabilities?.has(capability)) {
    sendJson(response, 403, { error: 'Seu perfil não tem permissão para esta ação.' })
    return null
  }
  return user
}

function environmentUsers() {
  try {
    const users = JSON.parse(process.env.VERDANT_USERS_JSON || '[]')
    return Array.isArray(users) ? users.filter((user) => typeof user.passwordHash === 'string' && (typeof user.username === 'string' || typeof user.email === 'string')) : []
  } catch {
    return []
  }
}

async function configuredUsers() {
  const storedUsers = await readJsonFile(teamUsersPath, [])
  const stored = Array.isArray(storedUsers) ? storedUsers : []
  const identityOf = (user) => String(user.environmentIdentity || user.username || user.email || '').trim().toLowerCase()
  const overrides = new Map(stored.map((user) => [identityOf(user), user]))
  const environment = environmentUsers()
  const environmentIdentities = new Set(environment.map(identityOf))
  const mergedEnvironment = environment.map((user) => {
    const override = overrides.get(identityOf(user))
    return override ? {
      ...user,
      environmentIdentity: identityOf(user),
      loginUsername: user.username || user.email?.split('@')[0] || '',
      displayName: typeof override.displayName === 'string' ? override.displayName : user.displayName,
      avatar: typeof override.avatar === 'string' ? override.avatar : user.avatar,
      email: typeof override.email === 'string' ? override.email : user.email,
      active: typeof override.active === 'boolean' ? override.active : user.active,
      ...(USER_ROLES.has(override.role) ? { role: override.role } : {}),
      managedByEnvironment: true,
    } : { ...user, environmentIdentity: identityOf(user), loginUsername: user.username || user.email?.split('@')[0] || '', managedByEnvironment: true }
  })
  const allUsers = [...mergedEnvironment, ...stored.filter((user) => !environmentIdentities.has(identityOf(user)))]
  const seen = new Set()
  const users = allUsers.filter((user) => {
    if (typeof user.passwordHash !== 'string' || (typeof user.username !== 'string' && typeof user.email !== 'string')) return false
    const identity = String(user.username || user.email).trim().toLowerCase()
    if (!identity || seen.has(identity)) return false
    seen.add(identity)
    return true
  })
  const legacyBootstrapUser = users.find((user) => user.active !== false && !USER_ROLES.has(user.role) && !Object.hasOwn(user, 'role'))
  for (const user of users) {
    if (USER_ROLES.has(user.role)) continue
    user.role = 'viewer'
  }

  const bootstrapUsername = String(process.env.VERDANT_ADMIN_USERNAME || '').trim().toLowerCase()
  const bootstrapUser = bootstrapUsername
    ? users.find((user) => user.active !== false && String(user.username || user.loginUsername || user.email?.split('@')[0] || '').trim().toLowerCase() === bootstrapUsername)
    : users.some((user) => user.active !== false && user.role === 'admin') ? null : legacyBootstrapUser
  if (bootstrapUser) bootstrapUser.role = 'admin'

  // Identidade Admin Master/DEV: só vale para uma conta já configurada (com hash de senha) no servidor.
  for (const user of users) {
    if (isMasterAdminAccount(user)) {
      user.role = 'admin'
      user.masterAdmin = true
    }
  }

  return users
}

function isMasterAdminAccount(user) {
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : ''
  const username = typeof user?.username === 'string' ? user.username.trim().toLowerCase() : ''
  return email === MASTER_ADMIN_EMAIL || username === MASTER_ADMIN_USERNAME
}

function publicTeamUsers(users, includeInactive = false) {
  return users.filter((user) => user.masterAdmin !== true && (includeInactive || user.active !== false)).map((user) => ({
    username: String(user.username || user.loginUsername || user.email?.split('@')[0] || ''),
    displayName: String(user.displayName || user.name || user.username || user.email?.split('@')[0] || ''),
    email: String(user.email || ''),
    role: USER_ROLES.has(user.role) ? user.role : 'viewer',
    active: user.active !== false,
    managedByEnvironment: user.managedByEnvironment === true,
    passwordConfigured: typeof user.passwordHash === 'string' && /^scrypt\$\d+\$\d+\$\d+\$[a-f0-9]+\$[a-f0-9]+$/i.test(user.passwordHash),
  })).filter((user) => user.username)
}

function integrationEncryptionKey() {
  const configured = String(process.env.VERDANT_INTEGRATION_ENCRYPTION_KEY || '').trim()
  if (!configured) return null
  const isHex = /^[a-f0-9]{64}$/i.test(configured)
  const isBase64 = /^[A-Za-z0-9+/]{43}=$/.test(configured)
  if (!isHex && !isBase64) {
    const error = new Error('VERDANT_INTEGRATION_ENCRYPTION_KEY deve conter uma chave de 32 bytes em base64 ou hexadecimal.')
    error.status = 503
    throw error
  }
  const key = isHex ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64')
  if (key.length !== 32) {
    const error = new Error('VERDANT_INTEGRATION_ENCRYPTION_KEY deve conter uma chave de 32 bytes em base64 ou hexadecimal.')
    error.status = 503
    throw error
  }
  return key
}

function encryptIntegrationSecret(secret) {
  const key = integrationEncryptionKey()
  if (!key) {
    const error = new Error('Configure VERDANT_INTEGRATION_ENCRYPTION_KEY no ambiente do servidor antes de salvar credenciais.')
    error.status = 503
    throw error
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return { algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
}

function decryptIntegrationSecret(payload) {
  const key = integrationEncryptionKey()
  if (!key || !payload?.ciphertext) return ''
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    const error = new Error('Não foi possível descriptografar o token da Zig. Confira VERDANT_INTEGRATION_ENCRYPTION_KEY ou salve o token novamente.')
    error.status = 409
    throw error
  }
}

const ZIG_TEST_BASE_URL = process.env.NODE_ENV === 'test' ? String(process.env.VERDANT_ZIG_TEST_BASE_URL || '') : ''
let zigPreviewRunning = false

function zigSettingsForAdmin(value) {
  const zig = value?.zig || {}
  const redeId = String(zig.redeId || '')
  const lojaId = String(zig.lojaId || '')
  const tokenConfigured = Boolean(value?.secrets?.zigToken?.ciphertext)
  const missing = []
  if (!tokenConfigured) missing.push('token')
  if (!redeId) missing.push('rede')
  if (!lojaId) missing.push('loja')
  let encryptionKeyConfigured = true
  try { encryptionKeyConfigured = Boolean(integrationEncryptionKey()) } catch { encryptionKeyConfigured = false }
  return { baseUrl: ZIG_BASE_URL, tokenConfigured, encryptionKeyConfigured, redeId, lojaId, lojaName: String(zig.lojaName || ''), missing }
}

async function zigContext({ needStore = false } = {}) {
  const stored = await readJsonFile(integrationsPath, {})
  const token = decryptIntegrationSecret(stored?.secrets?.zigToken)
  if (!validZigToken(token)) throw new ZigError('Configure o token de integração da Zig antes de continuar.', { code: 'zig_token_missing', status: 409 })
  const redeId = String(stored?.zig?.redeId || '')
  const lojaId = String(stored?.zig?.lojaId || '')
  if (!redeId) throw new ZigError('Informe o identificador da rede Zig antes de continuar.', { code: 'zig_rede_missing', status: 409 })
  if (needStore && !lojaId) throw new ZigError('Selecione a loja Verdant antes de continuar.', { code: 'zig_loja_missing', status: 409 })
  const client = createZigClient({ token, baseUrl: ZIG_TEST_BASE_URL || ZIG_BASE_URL })
  return { client, redeId, lojaId }
}

function sendZigError(response, error) {
  if (error instanceof ZigError || error?.status) {
    const status = Number.isInteger(error.status) ? error.status : 502
    return sendJson(response, status, { error: error.message, code: error.code || 'zig_error' })
  }
  console.error('Falha inesperada na integração Zig:', error?.name || 'Error')
  return sendJson(response, 500, { error: 'Falha inesperada na integração Zig.', code: 'zig_error' })
}

function integrationSettingsForAdmin(value) {
  const secrets = value?.secrets || {}
  return {
    metaPixelId: String(value?.metaPixelId || ''),
    whatsappTarget: String(value?.whatsappTarget || ''),
    gmailTarget: String(value?.gmailTarget || ''),
    gmailClientId: String(value?.gmailClientId || ''),
    telegramTarget: String(value?.telegramTarget || ''),
    credentials: {
      gmailClientSecretConfigured: Boolean(secrets.gmailClientSecret?.ciphertext),
      telegramBotTokenConfigured: Boolean(secrets.telegramBotToken?.ciphertext),
    },
  }
}

function validWhatsappTarget(value) {
  if (!value) return true
  if (/^\+?[\d\s().-]{10,24}$/.test(value)) return value.replace(/\D/g, '').length >= 10 && value.replace(/\D/g, '').length <= 15
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['wa.me', 'whatsapp.com', 'www.whatsapp.com', 'api.whatsapp.com'].includes(url.hostname)
  } catch {
    return false
  }
}

function validTelegramTarget(value) {
  if (!value) return true
  if (/^@?[A-Za-z0-9_]{5,32}$/.test(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['t.me', 'www.t.me'].includes(url.hostname)
  } catch {
    return false
  }
}

function publicConversation(conversation, users, currentUsername) {
  const team = new Map(publicTeamUsers(users, true).map((user) => [user.username.toLowerCase(), user]))
  const otherUsernames = (conversation.participants || []).filter((username) => username.toLowerCase() !== currentUsername.toLowerCase())
  const names = otherUsernames.map((username) => team.get(username.toLowerCase())?.displayName || username)
  const fullName = names.join(', ') || 'Equipe'
  return {
    id: conversation.id,
    profile: '',
    username: otherUsernames.join(', '),
    fullName,
    title: otherUsernames.length > 1 ? `${otherUsernames.length + 1} pessoas` : 'Equipe',
    participantUsernames: conversation.participants || [],
    messages: (conversation.messages || []).map((message) => ({
      ...message,
      senderName: team.get(String(message.sender).toLowerCase())?.displayName || message.sender,
    })),
    updatedAt: conversation.updatedAt || conversation.createdAt || '',
  }
}

function validTask(value, existing = {}, users = []) {
  const assignee = String(value.assignee || '')
  const assignedUser = publicTeamUsers(users).find((user) => user.username === assignee)
  const task = {
    id: String(existing.id || value.id || `task-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`),
    title: String(value.title || '').trim().slice(0, 180),
    description: String(value.description || '').trim().slice(0, 2000),
    status: String(value.status || 'todo'),
    label: String(value.label || 'feature'),
    priority: String(value.priority || 'medium'),
    assignee,
    assigneeName: assignedUser?.displayName || (assignee === existing.assignee ? existing.assigneeName : '') || '',
    dueDate: String(value.dueDate || ''),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  if (task.title.length < 2) throw requestError('Informe um título com pelo menos 2 caracteres.')
  if (!['backlog', 'todo', 'in progress', 'done', 'canceled'].includes(task.status)) throw requestError('Status inválido.')
  if (!['documentation', 'feature', 'bug'].includes(task.label)) throw requestError('Categoria inválida.')
  if (!['low', 'medium', 'high', 'critical'].includes(task.priority)) throw requestError('Prioridade inválida.')
  if (task.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) throw requestError('Prazo inválido.')
  if (task.assignee && !assignedUser && task.assignee !== existing.assignee) throw requestError('Selecione um membro ativo da equipe.')
  return task
}

async function passwordMatches(password, storedHash) {
  const [algorithm, cost, blockSize, parallelism, saltHex, expectedHex] = String(storedHash).split('$')
  if (algorithm !== 'scrypt' || !saltHex || !expectedHex) return false
  const expected = Buffer.from(expectedHex, 'hex')
  if (expected.length !== 64) return false
  try {
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), 64, {
      N: Number(cost), r: Number(blockSize), p: Number(parallelism), maxmem: 64 * 1024 * 1024,
    })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

async function passwordHash(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`
}

function queueTeamUserMutation(operation) {
  const result = teamUserMutationQueue.then(operation)
  teamUserMutationQueue = result.catch(() => {})
  return result
}

function queueChatMutation(operation) {
  const result = chatMutationQueue.then(operation, operation)
  chatMutationQueue = result.catch(() => {})
  return result
}

function requestIp(request) {
  const remoteAddress = request.socket.remoteAddress || 'unknown'
  const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0)
  if (!Number.isSafeInteger(trustedProxyHops) || trustedProxyHops < 1) return remoteAddress

  const forwardedHeader = request.headers['x-forwarded-for']
  if (typeof forwardedHeader !== 'string' || !forwardedHeader.trim()) return remoteAddress
  const forwarded = forwardedHeader.split(',').map((address) => address.trim())
  if (forwarded.some((address) => isIP(address) === 0)) return remoteAddress

  const chain = [...forwarded, remoteAddress]
  const clientIndex = chain.length - trustedProxyHops - 1
  return clientIndex >= 0 ? chain[clientIndex] : remoteAddress
}

function secureCookie(request) {
  const trustsProxy = Number(process.env.TRUST_PROXY_HOPS || 0) > 0
  return process.env.NODE_ENV === 'production' || (trustsProxy && String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') ? '; Secure' : ''
}

function publicFormData(state, slug) {
  const key = PUBLIC_FORM_KEYS[slug]
  if (!key) return null
  const now = Date.now()
  const configs = state.forms.filter((form) => form.key === key && form.enabled && !form.archivedAt && !form.deletedAt).filter((form) => {
    const event = state.events.find((item) => item.id === form.eventId && item.active)
    if (!event) return false
    const opens = dateTime(form.openAt)
    const closes = dateTime(`${event.date}T${form.cutoff || (key === 'ANIVERSARIO' ? '15:00' : '19:00')}`)
    return Number.isFinite(opens) && Number.isFinite(closes) && now >= opens && now < closes
  })
  const eventIds = new Set(configs.map((form) => form.eventId))
  const events = state.events.filter((event) => event.active && eventIds.has(event.id))
  const kind = key === 'DJS' ? 'DJ' : key === 'INFLUENCIADORES' ? 'INFLUENCIADORES' : ''
  const people = kind ? state.people.filter((person) => person.active && person.kind === kind && person.eventIds.some((id) => eventIds.has(id))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })).map(({ id, kind: personKind, name, eventIds: linkedEvents, eventDetails }) => ({
    id, kind: personKind, name,
    eventIds: linkedEvents.filter((id) => eventIds.has(id)),
    eventDetails: Object.fromEntries(Object.entries(eventDetails || {}).filter(([id]) => eventIds.has(id))),
  })) : []
  return { key, description: state.formDescriptions?.[key] || '', logo: state.formLogos?.[key] || '', events, forms: configs, people }
}

async function bodyJson(request, maxBytes = 1_000_000) {
  const chunks = []
  let bodyBytes = 0
  for await (const chunk of request) {
    bodyBytes += chunk.length
    if (bodyBytes > maxBytes) throw requestError('A solicitação excede o limite permitido.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw requestError('O corpo da solicitação contém JSON inválido.')
  }
}

function dateTime(value) {
  if (!value) return Number.NaN
  const text = String(value)
  return Date.parse(text.length === 16 ? `${text}:00-03:00` : text)
}

const BRAZILIAN_AREA_CODES = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38', '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55', '61', '62', '63', '64', '65', '66', '67', '68', '69', '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89', '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

function normalizeBrazilWhatsapp(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2)
  const areaCode = digits.slice(0, 2)
  return (digits.length === 10 || digits.length === 11) && BRAZILIAN_AREA_CODES.has(areaCode) ? digits : ''
}

function weekStart(date) {
  const [year, month, day] = String(date).slice(0, 10).split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day, 12))
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7))
  return value.toISOString().slice(0, 10)
}

function birthdayInEventWeek(birthday, eventDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return false
  const [birthYear, birthMonth, birthDay] = birthday.split('-').map(Number)
  const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay, 12))
  if (birthDate.toISOString().slice(0, 10) !== birthday) return false
  const eventYear = Number(String(eventDate).slice(0, 4))
  const monthDay = birthday.slice(4)
  return [eventYear - 1, eventYear, eventYear + 1].some((year) => {
    const candidate = String(year) + monthDay
    const [candidateYear, candidateMonth, candidateDay] = candidate.split('-').map(Number)
    const candidateDate = new Date(Date.UTC(candidateYear, candidateMonth - 1, candidateDay, 12))
    return candidateDate.toISOString().slice(0, 10) === candidate && weekStart(candidate) === weekStart(eventDate)
  })
}

function validateSubmission(state, value) {
  const key = String(value.formKey || '')
  const event = state.events.find((item) => item.id === String(value.eventId || '') && item.active)
  const config = state.forms.find((item) => item.key === key && item.eventId === String(value.eventId || '') && item.enabled)
  if (!event || !config) throw requestError('A data escolhida não está disponível neste formulário.')
  const closes = dateTime(`${event.date}T${config.cutoff || (key === 'ANIVERSARIO' ? '15:00' : '19:00')}`)
  if (Date.now() < dateTime(config.openAt) || Date.now() >= closes) throw requestError('As inscrições desta data encerraram ou ainda não abriram.')
  const name = String(value.name || '').trim()
  const phoneInput = String(value.whatsapp || '').trim()
  const phone = phoneInput ? normalizeBrazilWhatsapp(phoneInput) : ''
  const email = String(value.email || '').trim()
  const requiredFields = { name: true, whatsapp: true, email: false, consent: true, ...(config.requiredFields || {}) }
  if ((requiredFields.name || name) && name.length < 3) throw requestError('Informe seu nome completo.')
  if ((requiredFields.whatsapp || phoneInput) && !phone) throw requestError('Informe um WhatsApp brasileiro válido com DDD.')
  if ((requiredFields.email || email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw requestError('Informe um e-mail válido.')
  if (requiredFields.consent && value.consentAnswered !== true) throw requestError('Escolha se aceita receber novidades.')
  const consentAnswered = value.consentAnswered === true

  const normalizedName = name.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ')
  const duplicate = phone && normalizedName && state.registrations.some((item) =>
    item.formKey === key
    && item.eventId === event.id
    && String(item.name || '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ') === normalizedName
    && normalizeBrazilWhatsapp(item.whatsapp) === phone,
  )
  if (duplicate) throw requestError('Já recebemos uma inscrição com este nome e WhatsApp para esta lista e data.', 409)

  let optionId = ''
  let optionName = ''
  let profileType = ''
  let birthdayDate = ''
  let guestNames = []
  if (key === 'DJS' || key === 'INFLUENCIADORES') {
    optionId = String(value.optionId || '')
    const kind = key === 'DJS' ? 'DJ' : 'INFLUENCIADORES'
    const linkedPeople = state.people.filter((item) => item.kind === kind && item.active && item.eventIds.includes(event.id))
      .sort((a, b) => (a.eventDetails?.[event.id]?.order ?? 999) - (b.eventDetails?.[event.id]?.order ?? 999))
    const person = linkedPeople.find((item) => item.id === optionId)
    if (!person) throw requestError('Selecione um profissional ativo vinculado a esta data.')
    optionName = person.name
  }
  if (key === 'VIP') {
    profileType = String(value.profileType || '')
    if (!['Pessoa trans', 'Artista Drag'].includes(profileType)) throw requestError('Selecione Pessoa trans ou Artista Drag.')
  }
  if (key === 'ANIVERSARIO') {
    birthdayDate = String(value.birthdayDate || '')
    guestNames = Array.isArray(value.guestNames)
      ? value.guestNames.map((item) => String(item).trim()).filter(Boolean)
      : String(value.guestNames || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    if (!birthdayInEventWeek(birthdayDate, event.date)) throw requestError('O dia e mês do aniversário precisam cair na mesma semana do evento, de segunda a domingo.')
    if (!guestNames.length || guestNames.length > Number(config.maxGuests || 0)) throw requestError(`Esta data aceita até ${Number(config.maxGuests || 0)} convidados.`)
    if (guestNames.some((item) => item.length > 120)) throw requestError('Cada nome de convidado deve ter até 120 caracteres.')
  }

  return {
    id: `reg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    formKey: key,
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    name,
    whatsapp: phone,
    email,
    consent: consentAnswered && value.consent === true,
    consentAnswered,
    optionId,
    optionName,
    profileType,
    birthdayDate,
    guestNames,
    createdAt: new Date().toISOString(),
    status: 'Recebido',
  }
}

async function serveStatic(request, response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname)
  let target = path.resolve(dist, `.${requestedPath}`)
  if (!target.startsWith(`${dist}${path.sep}`) && target !== path.join(dist, 'index.html')) {
    response.writeHead(403).end('Forbidden')
    return
  }
  try {
    const info = await stat(target)
    if (info.isDirectory()) target = path.join(target, 'index.html')
    await stat(target)
  } catch {
    target = path.join(dist, 'index.html')
  }
  try {
    const extension = path.extname(target)
    const formSlug = /^\/equipe\/?$/.test(pathname) ? 'equipe' : /^\/trabalhe-conosco\/?$/.test(pathname) ? 'trabalhe-conosco' : pathname === '/lovers' || pathname === '/lovers/'
      ? 'lovers'
      : pathname.match(/^\/lista\/([^/]+)\/?$/)?.[1]?.toLowerCase()
    const formMeta = formSlug ? PUBLIC_FORM_META[formSlug] : undefined
    if (extension === '.html' && formMeta && target === path.join(dist, 'index.html')) {
      const html = personalizeFormShareHtml(await readFile(target, 'utf8'), formSlug, PUBLIC_BASE_URL)
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
      response.end(html)
      return
    }
    response.writeHead(200, {
      'Content-Type': mime[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html'
        ? 'no-cache'
        : requestedPath.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=604800',
    })
    createReadStream(target).pipe(response)
  } catch {
    response.writeHead(503).end('O painel ainda não foi compilado.')
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      if (mysqlConfigured && mysqlStartupState !== 'ready') {
        return sendJson(response, 503, { ok: false, storage: 'mysql', database: mysqlStartupState })
      }
      return sendJson(response, 200, { ok: true, storage: mysqlPool ? 'mysql' : 'json', updatedAt: (await readState()).updatedAt || '' })
    }
    if (mysqlConfigured && mysqlStartupState !== 'ready' && url.pathname.startsWith('/api/')) {
      const message = mysqlStartupState === 'starting'
        ? 'Banco de dados inicializando. Tente novamente em instantes.'
        : 'Banco de dados indisponível. A aplicação está no ar, mas as operações aguardam a conexão MySQL.'
      return sendJson(response, 503, { error: message, code: 'MYSQL_UNAVAILABLE' })
    }
    if (url.pathname === '/api/finance' || url.pathname.startsWith('/api/finance/')) {
      const user = await requireCapability(request, response, 'finance:manage')
      if (!user) return
      const origin = request.headers.origin
      if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && ![
        `http://${request.headers.host}`, `https://${request.headers.host}`,
      ].includes(origin))) return sendJson(response, 403, { error: 'Origem não autorizada.' })
      if (request.method === 'GET' && url.pathname === '/api/finance') {
        const document = await readFinanceStore()
        return sendJson(response, 200, { ...document, ...await financeReferences() })
      }
      if (request.method === 'POST' && url.pathname === '/api/finance') {
        const result = await mutateFinance(await bodyJson(request, STATE_BODY_LIMIT_BYTES), user.username)
        return sendJson(response, 201, result)
      }
      const match = url.pathname.match(/^\/api\/finance\/([^/]+)$/)
      if (request.method === 'PUT' && match) {
        const result = await mutateFinance(await bodyJson(request), user.username, decodeURIComponent(match[1]))
        return sendJson(response, 200, result)
      }
      return sendJson(response, 405, { error: 'Método financeiro não permitido.' })
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const payload = await bodyJson(request)
      const username = String(payload.username || payload.email || '').trim().toLowerCase()
      const password = String(payload.password || '')
      const users = await configuredUsers()
      if (!users.length) return sendJson(response, 503, { error: 'O acesso seguro ainda não foi configurado pelo administrador.' })
      const user = users.find((item) => {
        if (item.active === false) return false
        const configuredUsername = String(item.username || item.loginUsername || '').trim().toLowerCase()
        const legacyEmail = typeof item.email === 'string' ? item.email.trim().toLowerCase() : ''
        const legacyUsername = legacyEmail.split('@')[0]
        return configuredUsername === username || (legacyEmail && (legacyUsername === username || legacyEmail === username))
      })
      const matched = await passwordMatches(password, user?.passwordHash || `scrypt$16384$8$1$${'00'.repeat(16)}$${'ff'.repeat(64)}`)
      if (!user || !matched) {
        return sendJson(response, 401, { error: 'Usuário ou senha inválidos.' })
      }
      const rememberMe = payload.rememberMe === true
      const sessionTtl = rememberMe ? REMEMBERED_SESSION_TTL : SESSION_TTL
      const token = randomBytes(32).toString('base64url')
      const expiresAt = Date.now() + sessionTtl
      const accountUsername = String(user.username || user.loginUsername || user.email.split('@')[0]).trim()
      await storeSession(token, { username: accountUsername, email: user.email || '', expiresAt })
      response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(sessionTtl / 1000)}${secureCookie(request)}`)
      return sendJson(response, 200, { user: { email: user.email || accountUsername, username: accountUsername, displayName: user.displayName || user.name || accountUsername, avatar: user.avatar || '', accountNo: 'verdant-team', role: [user.role], exp: expiresAt } })
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/session') {
      const user = await sessionUser(request)
      return user ? sendJson(response, 200, { user: { ...user, accountNo: 'verdant-team', role: [user.role] } }) : sendJson(response, 401, { authenticated: false })
    }
    if (request.method === 'GET' && url.pathname === '/api/profile') {
      const user = await sessionUser(request)
      if (!user) return sendJson(response, 401, { error: 'Sessão necessária.' })
      return sendJson(response, 200, { profile: { displayName: user.displayName || user.username, username: user.username, email: user.email, avatar: user.avatar || '' } })
    }
    if (request.method === 'PUT' && url.pathname === '/api/profile') {
      const session = await sessionUser(request)
      if (!session) return sendJson(response, 401, { error: 'Sessão necessária.' })
      const value = await bodyJson(request, 900_000)
      const displayName = String(value.displayName || '').trim()
      const avatar = String(value.avatar || '')
      if (displayName.length < 2 || displayName.length > 100) return sendJson(response, 400, { error: 'Informe um nome entre 2 e 100 caracteres.' })
      if (avatar && (!/^data:image\/(png|jpeg|webp);base64,/i.test(avatar) || avatar.length > 850_000)) return sendJson(response, 400, { error: 'Use uma foto PNG, JPG ou WEBP de até 600 KB.' })
      const saved = await queueTeamUserMutation(async () => {
        const users = await configuredUsers()
        const current = users.find((user) => String(user.username || user.loginUsername || user.email?.split('@')[0] || '').trim().toLowerCase() === session.username.toLowerCase())
        if (!current) throw requestError('Usuário não encontrado.', 404)
        const storedUsers = await readJsonFile(teamUsersPath, [])
        const next = Array.isArray(storedUsers) ? [...storedUsers] : []
        const identity = String(current.environmentIdentity || current.username || current.email || session.username).trim().toLowerCase()
        const storedIndex = next.findIndex((user) => String(user.environmentIdentity || user.username || user.email || '').trim().toLowerCase() === identity)
        const record = {
          ...(storedIndex >= 0 ? next[storedIndex] : {}),
          username: current.username || session.username,
          environmentIdentity: current.environmentIdentity || identity,
          displayName,
          avatar,
          email: current.email || session.email || '',
          active: current.active !== false,
          role: current.role,
          updatedAt: new Date().toISOString(),
        }
        if (current.managedByEnvironment) delete record.passwordHash
        else if (current.passwordHash) record.passwordHash = current.passwordHash
        if (storedIndex >= 0) next[storedIndex] = record
        else next.push(record)
        await writeJsonFile(teamUsersPath, next)
        return record
      })
      return sendJson(response, 200, { profile: { displayName: saved.displayName, username: session.username, email: saved.email, avatar: saved.avatar || '' } })
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = cookieValue(request, SESSION_COOKIE)
      if (token) await removeSession(token)
      response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie(request)}`)
      return sendJson(response, 200, { ok: true })
    }
    if (url.pathname === '/api/team' && request.method === 'GET') {
      if (!(await requireCapability(request, response, 'team:manage'))) return
      return sendJson(response, 200, { users: publicTeamUsers(await configuredUsers(), true) })
    }
    if (url.pathname === '/api/team/assignees' && request.method === 'GET') {
      if (!(await requireCapability(request, response, 'team:assignees'))) return
      const users = publicTeamUsers(await configuredUsers()).map(({ username, displayName }) => ({ username, displayName }))
      return sendJson(response, 200, { users })
    }
    if (url.pathname === '/api/team' && request.method === 'POST') {
      if (!(await requireCapability(request, response, 'team:manage'))) return
      const value = await bodyJson(request)
      const displayName = String(value.displayName || '').trim()
      const username = String(value.username || '').trim().toLowerCase()
      const email = String(value.email || '').trim().toLowerCase()
      const password = String(value.password || '')
      const role = value.role === undefined ? 'operator' : String(value.role)
      if (displayName.length < 2 || displayName.length > 100) return sendJson(response, 400, { error: 'Informe um nome de exibição entre 2 e 100 caracteres.' })
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) return sendJson(response, 400, { error: 'O usuário deve ter de 3 a 32 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.' })
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(response, 400, { error: 'Informe um e-mail válido. Qualquer domínio é aceito.' })
      if (password.length < 12 || password.length > 128) return sendJson(response, 400, { error: 'A senha deve ter entre 12 e 128 caracteres.' })
      if (!USER_ROLES.has(role)) return sendJson(response, 400, { error: 'Selecione um perfil de acesso válido.' })
      if (username === MASTER_ADMIN_USERNAME || email === MASTER_ADMIN_EMAIL) return sendJson(response, 409, { error: 'Este identificador é reservado.' })
      const hash = await passwordHash(password)
      const result = await queueTeamUserMutation(async () => {
        const users = await configuredUsers()
        if (users.some((user) => String(user.username || user.loginUsername || user.email?.split('@')[0] || '').trim().toLowerCase() === username)) {
          const error = new Error('Este nome de usuário já está cadastrado.')
          error.status = 409
          throw error
        }
        if (users.some((user) => String(user.email || '').trim().toLowerCase() === email)) {
          const error = new Error('Este e-mail já está cadastrado.')
          error.status = 409
          throw error
        }
        const storedUsers = await readJsonFile(teamUsersPath, [])
        const next = [...(Array.isArray(storedUsers) ? storedUsers : []), { username, displayName, email, passwordHash: hash, role, active: true, createdAt: new Date().toISOString() }]
        await writeJsonFile(teamUsersPath, next)
        return { username, displayName, email, role, active: true, managedByEnvironment: false }
      })
      return sendJson(response, 201, { user: result })
    }
    if (url.pathname.startsWith('/api/team/') && request.method === 'PUT') {
      const session = await requireCapability(request, response, 'team:manage')
      if (!session) return
      const targetUsername = decodeURIComponent(url.pathname.slice('/api/team/'.length)).trim().toLowerCase()
      const value = await bodyJson(request)
      const displayName = String(value.displayName || '').trim()
      const email = String(value.email || '').trim().toLowerCase()
      const active = value.active
      const password = String(value.password || '')
      const requestedRole = value.role
      if (displayName.length < 2 || displayName.length > 100) return sendJson(response, 400, { error: 'Informe um nome de exibição entre 2 e 100 caracteres.' })
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(response, 400, { error: 'Informe um e-mail válido.' })
      if (typeof active !== 'boolean') return sendJson(response, 400, { error: 'Informe se o acesso ficará ativo.' })
      if (password && (password.length < 12 || password.length > 128)) return sendJson(response, 400, { error: 'A nova senha deve ter entre 12 e 128 caracteres.' })
      if (requestedRole !== undefined && !USER_ROLES.has(String(requestedRole))) return sendJson(response, 400, { error: 'Selecione um perfil de acesso válido.' })
      if (!active && session.username.toLowerCase() === targetUsername) return sendJson(response, 400, { error: 'Você não pode desativar o próprio acesso durante esta sessão.' })
      const result = await queueTeamUserMutation(async () => {
        const users = await configuredUsers()
        const current = users.find((user) => String(user.username || user.loginUsername || user.email?.split('@')[0] || '').trim().toLowerCase() === targetUsername)
        if (!current) {
          const error = new Error('Este usuário não foi encontrado.')
          error.status = 404
          throw error
        }
        if (current.masterAdmin === true) {
          const error = new Error('Este usuário não foi encontrado.')
          error.status = 404
          throw error
        }
        if (email === MASTER_ADMIN_EMAIL) {
          const error = new Error('Este e-mail é reservado.')
          error.status = 409
          throw error
        }
        const role = requestedRole === undefined ? current.role : String(requestedRole)
        if (String(process.env.VERDANT_ADMIN_USERNAME || '').trim().toLowerCase() === targetUsername && role !== 'admin') {
          const error = new Error('O perfil da conta administradora definida no servidor deve ser alterado na configuração do ambiente.')
          error.status = 409
          throw error
        }
        if (current.role === 'admin' && (role !== 'admin' || !active) && users.filter((user) => user.role === 'admin' && user.active !== false && user.masterAdmin !== true).length <= 1) {
          const error = new Error('Não é possível remover ou desativar a última conta administradora ativa.')
          error.status = 409
          throw error
        }
        if (current.managedByEnvironment && password) {
          const error = new Error('A senha desta conta é gerenciada pelas configurações do servidor.')
          error.status = 409
          throw error
        }
        if (users.some((user) => String(user.username || user.loginUsername || user.email?.split('@')[0] || '').trim().toLowerCase() !== targetUsername && String(user.email || '').trim().toLowerCase() === email)) {
          const error = new Error('Este e-mail já está vinculado a outra conta.')
          error.status = 409
          throw error
        }
        const storedUsers = await readJsonFile(teamUsersPath, [])
        const next = Array.isArray(storedUsers) ? [...storedUsers] : []
        const currentIdentity = String(current.environmentIdentity || current.username || current.email || targetUsername).trim().toLowerCase()
        const storedIndex = next.findIndex((user) => String(user.environmentIdentity || user.username || user.email || '').trim().toLowerCase() === currentIdentity)
        const record = { ...(storedIndex >= 0 ? next[storedIndex] : {}), username: current.username || current.email || targetUsername, environmentIdentity: current.environmentIdentity, displayName, email, active, role }
        if (current.managedByEnvironment) delete record.passwordHash
        else record.passwordHash = password ? await passwordHash(password) : current.passwordHash
        record.updatedAt = new Date().toISOString()
        if (storedIndex >= 0) next[storedIndex] = record
        else next.push(record)
        await writeJsonFile(teamUsersPath, next)
        return { username: targetUsername, displayName, email, role, active, managedByEnvironment: current.managedByEnvironment === true }
      })
      return sendJson(response, 200, { user: result })
    }
    if (url.pathname === '/api/chats' && request.method === 'GET') {
      const session = await requireCapability(request, response, 'team:chat')
      if (!session) return
      const users = await configuredUsers()
      const conversations = await readJsonFile(chatsPath, [])
      const visible = (Array.isArray(conversations) ? conversations : [])
        .filter((conversation) => Array.isArray(conversation.participants) && conversation.participants.includes(session.username))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .map((conversation) => publicConversation(conversation, users, session.username))
      const chatUsers = publicTeamUsers(users).filter((user) => user.username.toLowerCase() !== session.username.toLowerCase()).map(({ username, displayName }) => ({ username, displayName }))
      return sendJson(response, 200, { currentUsername: session.username, users: chatUsers, conversations: visible })
    }
    if (url.pathname === '/api/chats' && request.method === 'POST') {
      const session = await requireCapability(request, response, 'team:chat')
      if (!session) return
      const value = await bodyJson(request)
      if (!Array.isArray(value.usernames) || value.usernames.length < 1 || value.usernames.length > 19) return sendJson(response, 400, { error: 'Selecione de 1 a 19 pessoas para iniciar uma conversa.' })
      const users = await configuredUsers()
      const activeUsers = publicTeamUsers(users)
      const byUsername = new Map(activeUsers.map((user) => [user.username.toLowerCase(), user.username]))
      const recipients = [...new Set(value.usernames.map((item) => String(item).trim().toLowerCase()))]
      if (recipients.some((username) => !username || username === session.username.toLowerCase() || !byUsername.has(username))) return sendJson(response, 400, { error: 'A conversa inclui uma conta inativa ou inválida.' })
      const participants = [...new Set([session.username, ...recipients.map((username) => byUsername.get(username))])].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
      const conversation = await queueChatMutation(async () => {
        const current = await readJsonFile(chatsPath, [])
        const conversations = Array.isArray(current) ? current : []
        const participantSet = new Set(participants.map((username) => username.toLowerCase()))
        const existing = conversations.find((item) => Array.isArray(item.participants) && item.participants.length === participants.length && item.participants.every((username) => participantSet.has(String(username).toLowerCase())))
        if (existing) return existing
        const created = { id: `chat-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`, participants, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        await writeJsonFile(chatsPath, [...conversations, created])
        return created
      })
      return sendJson(response, 201, { conversation: publicConversation(conversation, users, session.username) })
    }
    const chatMessageMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages$/)
    if (chatMessageMatch && request.method === 'POST') {
      const session = await requireCapability(request, response, 'team:chat')
      if (!session) return
      const value = await bodyJson(request)
      const messageText = String(value.message || '').trim()
      if (!messageText || messageText.length > 2000) return sendJson(response, 400, { error: 'Escreva uma mensagem de até 2.000 caracteres.' })
      const users = await configuredUsers()
      const conversation = await queueChatMutation(async () => {
        const current = await readJsonFile(chatsPath, [])
        const conversations = Array.isArray(current) ? [...current] : []
        const index = conversations.findIndex((item) => item.id === decodeURIComponent(chatMessageMatch[1]) && item.participants?.includes(session.username))
        if (index < 0) {
          const error = new Error('Conversa não encontrada.')
          error.status = 404
          throw error
        }
        const previous = conversations[index]
        const message = { id: `message-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`, sender: session.username, message: messageText, timestamp: new Date().toISOString() }
        conversations[index] = { ...previous, messages: [...(previous.messages || []), message], updatedAt: message.timestamp }
        await writeJsonFile(chatsPath, conversations)
        return conversations[index]
      })
      return sendJson(response, 201, { conversation: publicConversation(conversation, users, session.username) })
    }
    if (url.pathname === '/api/tasks' && request.method === 'GET') {
      if (!(await requireCapability(request, response, 'tasks:read'))) return
      return sendJson(response, 200, { tasks: await readJsonFile(tasksPath, []) })
    }
    if (url.pathname === '/api/tasks' && request.method === 'POST') {
      if (!(await requireCapability(request, response, 'tasks:write'))) return
      const value = await bodyJson(request)
      const tasks = await readJsonFile(tasksPath, [])
      const task = validTask(value, {}, await configuredUsers())
      tasks.unshift(task)
      await writeJsonFile(tasksPath, tasks)
      return sendJson(response, 201, task)
    }
    if (url.pathname === '/api/tasks/import' && request.method === 'POST') {
      if (!(await requireCapability(request, response, 'tasks:write'))) return
      const value = await bodyJson(request)
      if (!Array.isArray(value.tasks) || value.tasks.length < 1 || value.tasks.length > 500) return sendJson(response, 400, { error: 'O arquivo precisa conter de 1 a 500 tarefas.' })
      const current = await readJsonFile(tasksPath, [])
      const users = await configuredUsers()
      const imported = value.tasks.map((item) => validTask(item, {}, users))
      await writeJsonFile(tasksPath, [...imported, ...current])
      return sendJson(response, 201, { tasks: imported })
    }
    if (url.pathname.startsWith('/api/tasks/') && request.method === 'PUT') {
      if (!(await requireCapability(request, response, 'tasks:write'))) return
      const id = decodeURIComponent(url.pathname.slice('/api/tasks/'.length))
      const value = await bodyJson(request)
      const tasks = await readJsonFile(tasksPath, [])
      const index = tasks.findIndex((item) => item.id === id)
      if (index < 0) return sendJson(response, 404, { error: 'Tarefa não encontrada.' })
      tasks[index] = validTask(value, tasks[index], await configuredUsers())
      await writeJsonFile(tasksPath, tasks)
      return sendJson(response, 200, tasks[index])
    }
    if (url.pathname.startsWith('/api/tasks/') && request.method === 'DELETE') {
      if (!(await requireCapability(request, response, 'tasks:write'))) return
      const id = decodeURIComponent(url.pathname.slice('/api/tasks/'.length))
      const tasks = await readJsonFile(tasksPath, [])
      if (!tasks.some((item) => item.id === id)) return sendJson(response, 404, { error: 'Tarefa não encontrada.' })
      await writeJsonFile(tasksPath, tasks.filter((item) => item.id !== id))
      return sendJson(response, 200, { ok: true })
    }
    if (url.pathname === '/api/content-plan' && request.method === 'GET') {
      if (!(await requireCapability(request, response, 'business:read'))) return
      response.setHeader('Cache-Control', 'no-store')
      const stored = await readJsonFile(contentPlanPath, INITIAL_CONTENT_PLAN)
      const enriched = enrichContentPlan(stored)
      if (enriched.changed) await writeJsonFile(contentPlanPath, enriched.items)
      return sendJson(response, 200, { items: enriched.items })
    }
    if (url.pathname === '/api/content-plan' && request.method === 'POST') {
      if (!(await requireCapability(request, response, 'business:write'))) return
      const value = await bodyJson(request, 20_000)
      const items = await readJsonFile(contentPlanPath, INITIAL_CONTENT_PLAN)
      const item = validContentPlanItem(value)
      await writeJsonFile(contentPlanPath, [...items, item])
      return sendJson(response, 201, item)
    }
    if (url.pathname.startsWith('/api/content-plan/') && request.method === 'PUT') {
      if (!(await requireCapability(request, response, 'business:write'))) return
      const id = decodeURIComponent(url.pathname.slice('/api/content-plan/'.length))
      const value = await bodyJson(request, 20_000)
      const items = await readJsonFile(contentPlanPath, INITIAL_CONTENT_PLAN)
      const index = items.findIndex((item) => item.id === id)
      if (index < 0) return sendJson(response, 404, { error: 'Publicação não encontrada.' })
      const next = [...items]
      next[index] = validContentPlanItem(value, items[index])
      await writeJsonFile(contentPlanPath, next)
      return sendJson(response, 200, next[index])
    }
    if (url.pathname.startsWith('/api/content-plan/') && request.method === 'DELETE') {
      if (!(await requireCapability(request, response, 'business:write'))) return
      const id = decodeURIComponent(url.pathname.slice('/api/content-plan/'.length))
      const items = await readJsonFile(contentPlanPath, INITIAL_CONTENT_PLAN)
      if (!items.some((item) => item.id === id)) return sendJson(response, 404, { error: 'Publicação não encontrada.' })
      await writeJsonFile(contentPlanPath, items.filter((item) => item.id !== id))
      return sendJson(response, 200, { ok: true })
    }
    if (url.pathname === '/api/preferences' && request.method === 'GET') {
      const user = await requireCapability(request, response, 'preferences:read')
      if (!user) return
      const preferences = await readJsonFile(preferencesPath, {})
      return sendJson(response, 200, preferences[user.username] || { navigation: [], dashboardWidgets: [] })
    }
    if (url.pathname === '/api/preferences' && request.method === 'PUT') {
      const user = await requireCapability(request, response, 'preferences:write')
      if (!user) return
      const value = await bodyJson(request)
      const allowedNavigation = new Set(['/', '/tasks', '/apps', '/chats', '/users', '/verdant/agenda', '/verdant/conteudo', '/verdant/escalas', '/verdant/financeiro', '/verdant/cadastros', '/verdant/formularios', '/verdant/listas', '/verdant/respostas', '/verdant/inscricoes', '/verdant/djs', '/verdant/influencers', '/verdant/configuracoes', '/help-center', '/settings', '/settings/account', '/settings/appearance', '/settings/notifications', '/settings/display'])
      const allowedDashboardWidgets = new Set(['registration-count', 'active-events', 'enabled-forms', 'professionals', 'period-chart', 'recent-registrations', 'list-operation'])
      const hasNavigation = Array.isArray(value?.navigation)
      const hasDashboardWidgets = Array.isArray(value?.dashboardWidgets)
      if (!hasNavigation && !hasDashboardWidgets) {
        return sendJson(response, 400, { error: 'Preferências de exibição inválidas.' })
      }
      if (hasNavigation && (value.navigation.length === 0 || value.navigation.length > allowedNavigation.size || value.navigation.some((item) => !allowedNavigation.has(item)))) {
        return sendJson(response, 400, { error: 'Preferências de navegação inválidas.' })
      }
      if (hasDashboardWidgets && (value.dashboardWidgets.length === 0 || value.dashboardWidgets.length > allowedDashboardWidgets.size || value.dashboardWidgets.some((item) => !allowedDashboardWidgets.has(item)))) {
        return sendJson(response, 400, { error: 'Módulos do Resumo inválidos.' })
      }
      const preferences = await readJsonFile(preferencesPath, {})
      const previous = preferences[user.username] || {}
      preferences[user.username] = {
        ...previous,
        ...(hasNavigation ? { navigation: [...new Set(value.navigation)] } : {}),
        ...(hasDashboardWidgets ? { dashboardWidgets: [...new Set(value.dashboardWidgets)] } : {}),
      }
      await writeJsonFile(preferencesPath, preferences)
      return sendJson(response, 200, preferences[user.username])
    }
    if (url.pathname === '/api/admin/integrations' && request.method === 'GET') {
      if (!(await requireCapability(request, response, 'team:manage'))) return
      response.setHeader('Cache-Control', 'no-store')
      return sendJson(response, 200, { settings: integrationSettingsForAdmin(await readJsonFile(integrationsPath, {})) })
    }
    if (url.pathname === '/api/admin/integrations' && request.method === 'PUT') {
      if (!(await requireCapability(request, response, 'team:manage'))) return
      const value = await bodyJson(request)
      if (!value || typeof value !== 'object' || Array.isArray(value)) return sendJson(response, 400, { error: 'Configuração de integração inválida.' })
      const allowedFields = new Set(['metaPixelId', 'whatsappTarget', 'gmailTarget', 'gmailClientId', 'gmailClientSecret', 'telegramTarget', 'telegramBotToken', 'clearGmailClientSecret', 'clearTelegramBotToken'])
      if (Object.keys(value).some((field) => !allowedFields.has(field))) return sendJson(response, 400, { error: 'A configuração contém campos não reconhecidos.' })
      const current = await readJsonFile(integrationsPath, {})
      const settings = { ...current }
      const fields = ['metaPixelId', 'whatsappTarget', 'gmailTarget', 'gmailClientId', 'telegramTarget']
      for (const field of fields) {
        if (value[field] === undefined) continue
        if (typeof value[field] !== 'string') return sendJson(response, 400, { error: `O campo ${field} deve ser texto.` })
        settings[field] = value[field].trim()
      }
      if (settings.metaPixelId && !/^\d{5,30}$/.test(settings.metaPixelId)) return sendJson(response, 400, { error: 'O ID do Meta Pixel deve conter somente números.' })
      if (!validWhatsappTarget(settings.whatsappTarget)) return sendJson(response, 400, { error: 'Informe um telefone com DDD ou link HTTPS oficial do WhatsApp.' })
      if (settings.gmailTarget && (settings.gmailTarget.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.gmailTarget))) return sendJson(response, 400, { error: 'Informe um endereço de e-mail válido para o atalho do Gmail.' })
      if (settings.gmailClientId.length > 512) return sendJson(response, 400, { error: 'O Client ID do Gmail excede o limite permitido.' })
      if (!validTelegramTarget(settings.telegramTarget)) return sendJson(response, 400, { error: 'Informe um usuário ou link HTTPS do Telegram.' })
      const gmailSecret = value.gmailClientSecret
      const telegramToken = value.telegramBotToken
      if (gmailSecret !== undefined && (typeof gmailSecret !== 'string' || gmailSecret.length > 2048)) return sendJson(response, 400, { error: 'O segredo do Gmail deve ter até 2.048 caracteres.' })
      if (telegramToken !== undefined && (typeof telegramToken !== 'string' || telegramToken.length > 1024)) return sendJson(response, 400, { error: 'O token do Telegram deve ter até 1.024 caracteres.' })
      if (value.clearGmailClientSecret !== undefined && typeof value.clearGmailClientSecret !== 'boolean') return sendJson(response, 400, { error: 'A opção de remoção do segredo do Gmail é inválida.' })
      if (value.clearTelegramBotToken !== undefined && typeof value.clearTelegramBotToken !== 'boolean') return sendJson(response, 400, { error: 'A opção de remoção do token do Telegram é inválida.' })
      settings.secrets = { ...(current.secrets || {}) }
      if (value.clearGmailClientSecret === true) delete settings.secrets.gmailClientSecret
      else if (typeof gmailSecret === 'string' && gmailSecret) settings.secrets.gmailClientSecret = encryptIntegrationSecret(gmailSecret)
      if (value.clearTelegramBotToken === true) delete settings.secrets.telegramBotToken
      else if (typeof telegramToken === 'string' && telegramToken) settings.secrets.telegramBotToken = encryptIntegrationSecret(telegramToken)
      await writeJsonFile(integrationsPath, settings)
      response.setHeader('Cache-Control', 'no-store')
      return sendJson(response, 200, { settings: integrationSettingsForAdmin(settings) })
    }
    if (url.pathname.startsWith('/api/admin/zig/')) {
      if (!(await requireCapability(request, response, 'zig:manage'))) return
      response.setHeader('Cache-Control', 'no-store')
      const route = url.pathname.slice('/api/admin/zig/'.length)
      try {
        if (route === 'config' && request.method === 'GET') {
          return sendJson(response, 200, { settings: zigSettingsForAdmin(await readJsonFile(integrationsPath, {})) })
        }
        if (route === 'config' && request.method === 'PUT') {
          const value = await bodyJson(request)
          if (!value || typeof value !== 'object' || Array.isArray(value)) return sendJson(response, 400, { error: 'Configuração da Zig inválida.' })
          const allowed = new Set(['token', 'clearToken', 'redeId', 'lojaId', 'lojaName'])
          if (Object.keys(value).some((field) => !allowed.has(field))) return sendJson(response, 400, { error: 'A configuração contém campos não reconhecidos.' })
          const idPattern = /^[A-Za-z0-9_-]{1,64}$/
          for (const field of ['redeId', 'lojaId']) {
            if (value[field] !== undefined && (typeof value[field] !== 'string' || (value[field].trim() && !idPattern.test(value[field].trim())))) {
              return sendJson(response, 400, { error: `O campo ${field} aceita apenas letras, números, hífen e sublinhado (até 64).` })
            }
          }
          if (value.lojaName !== undefined && (typeof value.lojaName !== 'string' || value.lojaName.length > 120)) return sendJson(response, 400, { error: 'O nome da loja deve ter até 120 caracteres.' })
          if (value.clearToken !== undefined && typeof value.clearToken !== 'boolean') return sendJson(response, 400, { error: 'A opção de remoção do token é inválida.' })
          if (value.token !== undefined && (typeof value.token !== 'string' || (value.token && !validZigToken(value.token)))) return sendJson(response, 400, { error: 'O token da Zig é inválido (sem espaços, até 2.048 caracteres).' })
          const current = await readJsonFile(integrationsPath, {})
          const settings = { ...current, zig: { ...(current.zig || {}) }, secrets: { ...(current.secrets || {}) } }
          if (value.redeId !== undefined) {
            const redeId = value.redeId.trim()
            if (redeId !== String(settings.zig.redeId || '')) { settings.zig.lojaId = ''; settings.zig.lojaName = '' }
            settings.zig.redeId = redeId
          }
          if (value.lojaId !== undefined) {
            settings.zig.lojaId = value.lojaId.trim()
            settings.zig.lojaName = settings.zig.lojaId ? String(value.lojaName ?? '').trim() : ''
          }
          if (value.clearToken === true) delete settings.secrets.zigToken
          else if (typeof value.token === 'string' && value.token.trim()) settings.secrets.zigToken = encryptIntegrationSecret(value.token.trim())
          await writeJsonFile(integrationsPath, settings)
          return sendJson(response, 200, { settings: zigSettingsForAdmin(settings) })
        }
        if (route === 'stores' && request.method === 'GET') {
          const { client, redeId } = await zigContext()
          const stores = await client.listStores(redeId)
          return sendJson(response, 200, { stores: stores.map((store) => ({ id: String(store?.id ?? ''), name: String(store?.name ?? '') })).filter((store) => store.id) })
        }
        if (route === 'test' && request.method === 'POST') {
          const { client, redeId, lojaId } = await zigContext()
          const stores = await client.listStores(redeId)
          const selected = lojaId ? stores.find((store) => String(store?.id) === lojaId) : null
          return sendJson(response, 200, {
            ok: true,
            storeCount: stores.length,
            storeSelected: Boolean(lojaId),
            storeFound: lojaId ? Boolean(selected) : null,
            storeName: selected ? String(selected.name ?? '') : '',
            message: !lojaId
              ? 'Conexão válida. Selecione a loja Verdant para continuar.'
              : selected ? 'Conexão válida e loja encontrada.' : 'Conexão válida, mas a loja salva não aparece nesta rede. Selecione a loja novamente.',
          })
        }
        if (route === 'events' && request.method === 'GET') {
          const { client, lojaId } = await zigContext({ needStore: true })
          const dtinicio = String(url.searchParams.get('dtinicio') || '')
          const dtfim = String(url.searchParams.get('dtfim') || '')
          const invalid = validatePreviewPeriod(dtinicio, dtfim)
          if (invalid) return sendJson(response, 400, { error: invalid })
          const events = await listZigEvents(client, lojaId, dtinicio, dtfim)
          return sendJson(response, 200, { events: events.map(({ id, name, beginAt, peopleCapacity }) => ({ id, name, beginAt, peopleCapacity })) })
        }
        if (route === 'preview' && request.method === 'POST') {
          const value = await bodyJson(request)
          const dtinicio = String(value?.dtinicio || '')
          const dtfim = String(value?.dtfim || '')
          const invalid = validatePreviewPeriod(dtinicio, dtfim)
          if (invalid) return sendJson(response, 400, { error: invalid })
          const { client, lojaId } = await zigContext({ needStore: true })
          if (zigPreviewRunning) return sendJson(response, 409, { error: 'Já existe uma prévia da Zig em andamento. Aguarde a conclusão.' })
          zigPreviewRunning = true
          try {
            const customers = await readJsonFile(customersPath, [])
            const state = await readState()
            const preview = await buildZigPreview({
              client, lojaId, dtinicio, dtfim,
              customers: Array.isArray(customers) ? customers : [],
              registrations: Array.isArray(state?.registrations) ? state.registrations : [],
            })
            return sendJson(response, 200, { preview })
          } finally {
            zigPreviewRunning = false
          }
        }
      } catch (error) {
        return sendZigError(response, error)
      }
      return sendJson(response, 404, { error: 'Rota não encontrada.' })
    }
    if (url.pathname === '/api/public/meta-pixel' && request.method === 'GET') {
      const pixelId = String((await readJsonFile(integrationsPath, {}))?.metaPixelId || '')
      response.setHeader('Cache-Control', 'no-store')
      return sendJson(response, 200, { pixelId: /^\d{5,30}$/.test(pixelId) ? pixelId : '' })
    }
    if (url.pathname === '/api/integrations/shortcuts' && request.method === 'GET') {
      return sendJson(response, 404, { error: 'Integração indisponível nesta versão.' })
    }
    if (request.method === 'POST' && url.pathname === '/api/public/job-applications') {
      const payload = await bodyJson(request, 16_384)
      const fields = validateJobApplication(payload, normalizeBrazilWhatsapp)
      const application = { id: `job-${randomBytes(16).toString('hex')}`, ...fields, createdAt: new Date().toISOString() }
      if (mysqlPool) {
        await mysqlPool.execute('INSERT INTO verdant_job_applications (id, created_at, payload) VALUES (?, ?, ?)', [application.id, application.createdAt, JSON.stringify(application)])
      } else {
        const operation = jobApplicationQueue.then(async () => {
          const applications = await readJsonFile(jobApplicationsPath, [])
          await writeJsonFile(jobApplicationsPath, [application, ...applications])
        })
        jobApplicationQueue = operation.catch(() => {})
        await operation
      }
      return sendJson(response, 201, { ok: true })
    }
    if (request.method === 'GET' && url.pathname === '/api/dashboard-summary') {
      const user = await requireCapability(request, response, 'business:read')
      if (!user) return
      response.setHeader('Cache-Control', 'no-store')
      const count = async (table, file) => {
        if (!mysqlPool) return (await readJsonFile(file, [])).length
        const [[{ total }]] = await mysqlPool.query(`SELECT COUNT(*) AS total FROM ${table}`)
        return Number(total)
      }
      const [jobApplications, teamRegistrations, tasks] = await Promise.all([
        count('verdant_job_applications', jobApplicationsPath),
        user.role === 'admin' ? count('verdant_team_registrations', teamRegistrationsPath) : Promise.resolve(null),
        readJsonFile(tasksPath, []),
      ])
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      const pending = tasks.filter((task) => !['done', 'canceled'].includes(task.status))
      const overdue = (task) => Boolean(task.dueDate && task.dueDate < today)
      const rank = { critical: 0, high: 1, medium: 2, low: 3 }
      const items = [...pending].sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (rank[a.priority] ?? 4) - (rank[b.priority] ?? 4) || String(a.id).localeCompare(String(b.id))).slice(0, 5).map(({ id, title, dueDate, priority }) => ({ id, title, dueDate, priority }))
      return sendJson(response, 200, { jobApplications, teamRegistrations, tasks: { pending: pending.length, overdue: pending.filter(overdue).length, items }, updatedAt: new Date().toISOString() })
    }
    if (request.method === 'GET' && url.pathname === '/api/registry/clients') {
      if (!(await requireCapability(request, response, 'customers:read'))) return
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0,100)
      const eventId = String(url.searchParams.get('event') || '')
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
      const state = await readState()
      const people = groupRegistryClients(state.registrations)
      const related = []
      if (mysqlPool) {
        const keys = [...new Set(people.flatMap(person => { const phone = registryPhone(person.phone); return phone ? [phone, `55${phone}`] : [] }))]
        for (let start = 0; start < keys.length; start += 300) {
          const batch = keys.slice(start,start+300)
          const [rows] = await mysqlPool.execute(`SELECT payload FROM verdant_customers WHERE phone_key IN (${batch.map(() => '?').join(',')})`, batch)
          related.push(...rows.map(row => JSON.parse(row.payload)))
        }
        const emails = [...new Set(people.filter(person=>!registryPhone(person.phone)).map(person=>String(person.email || '').trim().toLowerCase()).filter(Boolean))]
        for (let start = 0; start < emails.length; start += 300) {
          const batch = emails.slice(start,start+300)
          const [rows] = await mysqlPool.execute(`SELECT payload FROM verdant_customers WHERE email_key IN (${batch.map(() => '?').join(',')})`,batch)
          related.push(...rows.map(row=>JSON.parse(row.payload)))
        }

      } else related.push(...await readJsonFile(customersPath, []))
      const byIdentity = new Map(people.map(person => [registryIdentity(person), person]))
      const matched = new Set(related.map(registryIdentity))
      const matches = person => (!q || `${person.name} ${person.phone} ${person.email}`.toLowerCase().includes(q)) && (!eventId || person.history.some(row => row.eventId === eventId))
      const orphan = people.filter(person => (eventId || !matched.has(registryIdentity(person))) && matches(person)).sort((a,b) => a.name.localeCompare(b.name,'pt-BR'))
      const base = eventId ? { total: 0, customers: [] } : await queryCustomers(q, Math.max(0,offset-orphan.length), Math.max(0,50-Math.max(0,orphan.length-offset)))
      const clients = [...orphan.slice(offset,offset+50), ...base.customers.map(customer => ({ ...customer, history: byIdentity.get(registryIdentity(customer))?.history || [] }))]
      response.setHeader('Cache-Control', 'no-store')
      return sendJson(response,200,{ clients, total: orphan.length + base.total })
    }
    const rosterMatch = url.pathname.match(/^\/api\/rosters(?:\/([a-zA-Z0-9-]+))?$/)
    if (rosterMatch && ['GET','POST','PUT'].includes(request.method)) {
      const user = await requireCapability(request,response,'team:manage')
      if (!user) return
      response.setHeader('Cache-Control','no-store')
      if (request.method==='GET') {
        const [operations,team] = await Promise.all([readOperations(),readRosterTeam()])
        return sendJson(response,200,{rosters:operations.rosters,team:team.map(row=>({id:row.id,name:row.name,roles:row.roles,availability:row.availability,status:teamStatus(row,operations)}))})
      }
      if ((request.method==='POST' && rosterMatch[1]) || (request.method==='PUT' && !rosterMatch[1])) return sendJson(response,405,{error:'Método inválido.'})
      const payload = await bodyJson(request,262144)
      const result = await changeOperations(async document=>{
        const previous = rosterMatch[1] ? document.rosters.find(row=>row.id===rosterMatch[1]) : null
        if (rosterMatch[1] && !previous) throw requestError('Escala não encontrada.',404)
        if (previous && previous.version!==payload.version) throw requestError('A escala foi alterada por outra pessoa. Reabra antes de salvar.',409)
        const fields = validateRoster(payload,await readRosterTeam(),document,(await readState()).events)
        const roster = {...fields,id:previous?.id || `roster-${randomBytes(16).toString('hex')}`,version:(previous?.version || 0)+1,createdAt:previous?.createdAt || new Date().toISOString(),updatedAt:new Date().toISOString(),updatedBy:user.username}
        document.rosters = [roster,...document.rosters.filter(row=>row.id!==roster.id)]
        return roster
      })
      return sendJson(response,request.method==='POST'?201:200,{roster:result})
    }
    const memberEditMatch = url.pathname.match(/^\/api\/registry\/team\/([a-zA-Z0-9-]+)$/)
    if (memberEditMatch && request.method==='PATCH') {
      const user = await requireCapability(request,response,'team:manage')
      if (!user) return
      const payload = await bodyJson(request,4096)
      const pick = (input,allowed) => Array.isArray(input) && input.every(item=>allowed.includes(item)) ? [...new Set(input)] : null
      const roles = pick(payload.roles,TEAM_ROLES)
      const availability = pick(payload.availability,TEAM_DAYS)
      if (!roles || !availability || !roles.length || !availability.length) return sendJson(response,400,{error:'Selecione ao menos uma função e um dia válidos.'})
      const id = memberEditMatch[1]
      const operation = teamRegistrationQueue.then(async()=>{
        if (mysqlPool) {
          const [rows] = await mysqlPool.execute('SELECT payload FROM verdant_team_registrations WHERE id = ?',[id])
          if (!rows.length) return null
          const record = {...JSON.parse(rows[0].payload),roles,availability}
          await mysqlPool.execute('UPDATE verdant_team_registrations SET payload = ? WHERE id = ?',[JSON.stringify(record),id])
          return record
        }
        const applications = await readJsonFile(teamRegistrationsPath,[])
        const index = applications.findIndex(row=>row.id===id)
        if (index<0) return null
        applications[index] = {...applications[index],roles,availability}
        await writeJsonFile(teamRegistrationsPath,applications)
        return applications[index]
      })
      teamRegistrationQueue = operation.catch(()=>{})
      const record = await operation
      if (!record) return sendJson(response,404,{error:'Cadastro não encontrado. Recarregue a equipe.'})
      response.setHeader('Cache-Control','no-store')
      return sendJson(response,200,{record})
    }
    const memberMatch = url.pathname.match(/^\/api\/registry\/team\/([a-zA-Z0-9-]+)\/status$/)
    if (memberMatch && request.method==='PATCH') {
      const user = await requireCapability(request,response,'team:manage')
      if (!user) return
      const payload = await bodyJson(request,4096)
      if (!['pending','active','inactive'].includes(payload.status)) return sendJson(response,400,{error:'Status inválido.'})
      const record = await changeOperations(async document=>{
        const person = (await readRosterTeam()).find(row=>row.id===memberMatch[1])
        if (!person) throw requestError('Cadastro atualizado. Recarregue a equipe.',409)
        document.teamStatuses[registryIdentity(person)] = {status:payload.status,updatedAt:new Date().toISOString(),updatedBy:user.username}
        return {...person,status:payload.status}
      })
      response.setHeader('Cache-Control','no-store')
      return sendJson(response,200,{record})
    }
    if (request.method === 'GET' && ['/api/registry/candidates','/api/registry/team'].includes(url.pathname)) {
      const team = url.pathname.endsWith('/team')
      if (!(await requireCapability(request,response,team ? 'team:manage' : 'business:read'))) return
      const table = team ? 'verdant_team_registrations' : 'verdant_job_applications'
      const file = team ? teamRegistrationsPath : jobApplicationsPath
      let records
      if (mysqlPool) { const [rows] = await mysqlPool.query(`SELECT payload FROM ${table} ORDER BY created_at DESC, id DESC`); records = rows.map(row=>JSON.parse(row.payload)) }
      else records = await readJsonFile(file,[])
      if (team) { const operations = await readOperations(); records = latestTeam(records).map(row=>({...row,status:teamStatus(row,operations)})) }
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0,100)
      const status = String(url.searchParams.get('status') || '')
      const role = String(url.searchParams.get('role') || '')
      const availability = String(url.searchParams.get('availability') || '')
      records = records.filter(row => (!q || `${row.name} ${row.whatsapp}`.toLowerCase().includes(q) || (/\d/.test(q) && String(row.whatsapp || '').replace(/\D/g,'').includes(q.replace(/\D/g,'')))) && (!status || (row.status || 'new') === status) && (!role || row.roles.includes(role)) && (!availability || row.availability.includes(availability)))
      const sortKey = ['name','contact','roles','status'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'name'
      const direction = url.searchParams.get('dir') === 'desc' ? -1 : 1
      const sortValue = row => sortKey === 'contact' ? String(row.whatsapp || '') : sortKey === 'roles' ? [...(row.roles || [])].sort().join(', ') : sortKey === 'status' ? String(row.status || '') : String(row.name || '')
      records = [...records].sort((a,b) => direction * sortValue(a).localeCompare(sortValue(b),'pt-BR',{sensitivity:'base'}) || String(a.name || '').localeCompare(String(b.name || ''),'pt-BR',{sensitivity:'base'}))
      const offset = Math.max(0,Number(url.searchParams.get('offset')) || 0)
      response.setHeader('Cache-Control','no-store')
      return sendJson(response,200,{ records: records.slice(offset,offset+50), total: records.length })
    }
    const candidateMatch = url.pathname.match(/^\/api\/job-applications\/([a-zA-Z0-9-]+)(\/promote)?$/)
    if (candidateMatch && ((request.method === 'PATCH' && !candidateMatch[2]) || (request.method === 'POST' && candidateMatch[2]))) {
      const user = await requireCapability(request,response,'team:manage')
      if (!user) return
      const promote = Boolean(candidateMatch[2])
      const payload = await bodyJson(request,4096)
      if (!promote && !applicationStatuses.has(payload.status)) return sendJson(response,400,{ error: 'Status inválido.' })
      const mutate = async (application, team) => {
        if (!application) throw requestError('Candidato não encontrado.',404)
        if (promote) {
          const member = promotedTeam(application,team)
          return { application: { ...application, teamId: member.id, reviewedAt: new Date().toISOString(), reviewedBy: user.username }, member }
        }
        if (application.teamId && payload.status !== 'approved') throw requestError('Este candidato já foi adicionado à equipe.',409)
        return { application: { ...application, status: payload.status, reviewedAt: new Date().toISOString(), reviewedBy: user.username } }
      }
      let result
      if (mysqlPool) {
        const connection = await mysqlPool.getConnection()
        try {
          await connection.beginTransaction()
          const [rows] = await connection.execute('SELECT payload FROM verdant_job_applications WHERE id = ? FOR UPDATE',[candidateMatch[1]])
          // Serialize promotions so different applications for one person cannot create duplicates.
          if (promote) await connection.query('SELECT id FROM verdant_team_registrations ORDER BY id FOR UPDATE')
          const [teamRows] = promote ? await connection.query('SELECT payload FROM verdant_team_registrations') : [[]]
          result = await mutate(rows[0] ? JSON.parse(rows[0].payload) : null,teamRows.map(row=>JSON.parse(row.payload)))
          if (result.member) await connection.execute('INSERT IGNORE INTO verdant_team_registrations (id,created_at,payload) VALUES (?,?,?)',[result.member.id,result.member.createdAt,JSON.stringify(result.member)])
          await connection.execute('UPDATE verdant_job_applications SET payload = ? WHERE id = ?',[JSON.stringify(result.application),candidateMatch[1]])
          await connection.commit()
        } catch(error) { await connection.rollback(); throw error } finally { connection.release() }
      } else {
        const operation = Promise.all([jobApplicationQueue,teamRegistrationQueue]).then(async()=>{
          const applications = await readJsonFile(jobApplicationsPath,[])
          const team = await readJsonFile(teamRegistrationsPath,[])
          const changed = await mutate(applications.find(row=>row.id===candidateMatch[1]),team)
          if (changed.member && !team.some(row=>row.id===changed.member.id)) await writeJsonFile(teamRegistrationsPath,[changed.member,...team])
          await writeJsonFile(jobApplicationsPath,applications.map(row=>row.id===candidateMatch[1] ? changed.application : row))
          return changed
        })
        jobApplicationQueue = operation.catch(()=>{})
        teamRegistrationQueue = operation.catch(()=>{})
        result = await operation
      }
      response.setHeader('Cache-Control','no-store')
      return sendJson(response,200,{ application: result.application, teamId: result.member?.id })
    }
    if (request.method === 'GET' && url.pathname === '/api/job-applications') {
      if (!(await requireCapability(request, response, 'business:read'))) return
      response.setHeader('Cache-Control', 'no-store')
      const requestedOffset = Number(url.searchParams.get('offset') || 0)
      const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0
      const limit = 50
      if (mysqlPool) {
        const [[{ total }]] = await mysqlPool.query('SELECT COUNT(*) AS total FROM verdant_job_applications')
        const [rows] = await mysqlPool.execute('SELECT payload FROM verdant_job_applications ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', [limit, offset])
        return sendJson(response, 200, { applications: rows.map((row) => JSON.parse(row.payload)), total, offset, limit })
      }
      const applications = await readJsonFile(jobApplicationsPath, [])
      return sendJson(response, 200, { applications: applications.slice(offset, offset + limit), total: applications.length, offset, limit })
    }
    if (request.method === 'POST' && url.pathname === '/api/public/team-registrations') {
      const payload = await bodyJson(request, 16_384)
      const fields = validateTeamRegistration(payload, normalizeBrazilWhatsapp)
      const application = { id: `team-${randomBytes(16).toString('hex')}`, ...fields, createdAt: new Date().toISOString() }
      if (mysqlPool) {
        await mysqlPool.execute('INSERT INTO verdant_team_registrations (id, created_at, payload) VALUES (?, ?, ?)', [application.id, application.createdAt, JSON.stringify(application)])
      } else {
        const operation = teamRegistrationQueue.then(async () => {
          const applications = await readJsonFile(teamRegistrationsPath, [])
          await writeJsonFile(teamRegistrationsPath, [application, ...applications])
        })
        teamRegistrationQueue = operation.catch(() => {})
        await operation
      }
      return sendJson(response, 201, { ok: true })
    }
    if (request.method === 'POST' && ['/api/registry/team','/api/registry/candidates'].includes(url.pathname)) {
      const team = url.pathname.endsWith('/team')
      if (!(await requireCapability(request, response, 'team:manage'))) return
      const payload = await bodyJson(request, 16_384)
      const fields = validateJobApplication(payload, normalizeBrazilWhatsapp)
      if (!fields.roles.length || !fields.availability.length) return sendJson(response, 400, { error: 'Selecione ao menos uma função e um dia.' })
      const pixKey = typeof payload.pixKey === 'string' ? payload.pixKey.trim().slice(0, 254) : ''
      const createdAt = new Date().toISOString()
      const record = team
        ? { id: `team-${randomBytes(16).toString('hex')}`, ...fields, pixKey, createdAt, source: 'manual' }
        : { id: `job-${randomBytes(16).toString('hex')}`, ...fields, createdAt }
      const table = team ? 'verdant_team_registrations' : 'verdant_job_applications'
      const queue = team ? teamRegistrationQueue : jobApplicationQueue
      const operation = queue.then(async () => {
        if (mysqlPool) {
          const [rows] = await mysqlPool.query(`SELECT payload FROM ${table}`)
          if (rows.some((row) => registryIdentity(JSON.parse(row.payload)) === registryIdentity(record))) return false
          await mysqlPool.execute(`INSERT INTO ${table} (id, created_at, payload) VALUES (?, ?, ?)`, [record.id, record.createdAt, JSON.stringify(record)])
          return true
        }
        const file = team ? teamRegistrationsPath : jobApplicationsPath
        const current = await readJsonFile(file, [])
        if (current.some((row) => registryIdentity(row) === registryIdentity(record))) return false
        await writeJsonFile(file, [record, ...current])
        return true
      })
      if (team) teamRegistrationQueue = operation.catch(() => {}); else jobApplicationQueue = operation.catch(() => {})
      if (!(await operation)) return sendJson(response, 409, { error: 'Já existe um cadastro com esse nome e telefone.' })
      response.setHeader('Cache-Control', 'no-store')
      return sendJson(response, 201, { record })
    }
    if (request.method === 'POST' && url.pathname === '/api/team-registrations/import') {
      if (!(await requireCapability(request, response, 'team:manage'))) return
      const payload = await bodyJson(request, 512_000)
      if (!payload || !Array.isArray(payload.records) || payload.records.length > 500) return sendJson(response, 400, { error: 'Envie até 500 cadastros por importação.' })
      const records = payload.records.map((row) => {
        const fields = validateJobApplication(row, normalizeBrazilWhatsapp)
        if (!fields.roles.length || !fields.availability.length) throw requestError('Cada pessoa precisa ter função e disponibilidade válidas.', 400)
        const parsedDate = typeof row.createdAt === 'string' ? Date.parse(row.createdAt) : NaN
        return { id: `team-${randomBytes(16).toString('hex')}`, ...fields, pixKey: '', createdAt: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : new Date().toISOString(), source: 'legacy-import' }
      })
      let existing
      if (mysqlPool) {
        const [rows] = await mysqlPool.query('SELECT payload FROM verdant_team_registrations')
        existing = rows.map((row) => JSON.parse(row.payload))
      } else {
        existing = await readJsonFile(teamRegistrationsPath, [])
      }
      const identities = new Set(existing.map(registryIdentity))
      const imported = records.filter((row) => {
        const key = registryIdentity(row)
        if (identities.has(key)) return false
        identities.add(key)
        return true
      })
      if (mysqlPool) {
        for (const row of imported) await mysqlPool.execute('INSERT INTO verdant_team_registrations (id, created_at, payload) VALUES (?, ?, ?)', [row.id, row.createdAt, JSON.stringify(row)])
      } else if (imported.length) {
        const operation = teamRegistrationQueue.then(async () => {
          const applications = await readJsonFile(teamRegistrationsPath, [])
          const current = new Set(applications.map(registryIdentity))
          const fresh = imported.filter((row) => !current.has(registryIdentity(row)))
          await writeJsonFile(teamRegistrationsPath, [...fresh, ...applications])
          return fresh.length
        })
        teamRegistrationQueue = operation.catch(() => {})
        const inserted = await operation
        return sendJson(response, 200, { ok: true, imported: inserted, skipped: records.length - inserted })
      }
      return sendJson(response, 200, { ok: true, imported: imported.length, skipped: records.length - imported.length })
    }
    if (request.method === 'GET' && url.pathname === '/api/team-registrations') {
      if (!(await requireCapability(request, response, 'team:manage'))) return
      response.setHeader('Cache-Control', 'no-store')
      const requestedOffset = Number(url.searchParams.get('offset') || 0)
      const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0
      const limit = 50
      if (mysqlPool) {
        const [[{ total }]] = await mysqlPool.query('SELECT COUNT(*) AS total FROM verdant_team_registrations')
        const [rows] = await mysqlPool.execute('SELECT payload FROM verdant_team_registrations ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', [limit, offset])
        return sendJson(response, 200, { applications: rows.map((row) => JSON.parse(row.payload)), total, offset, limit })
      }
      const applications = await readJsonFile(teamRegistrationsPath, [])
      return sendJson(response, 200, { applications: applications.slice(offset, offset + limit), total: applications.length, offset, limit })
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/public/forms/')) {
      const slug = decodeURIComponent(url.pathname.slice('/api/public/forms/'.length)).toLowerCase()
      const publicData = publicFormData(await readState(), slug)
      return publicData ? sendJson(response, 200, publicData) : sendJson(response, 404, { error: 'Formulário não encontrado.' })
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/public/form-branding/')) {
      const slug = decodeURIComponent(url.pathname.slice('/api/public/form-branding/'.length)).toLowerCase()
      const key = slug === 'equipe' ? 'EQUIPE' : slug === 'trabalhe-conosco' ? 'TRABALHE_CONOSCO' : PUBLIC_FORM_KEYS[slug]
      if (!key) return sendJson(response, 404, { error: 'Formulário não encontrado.' })
      const state = await readState()
      return sendJson(response, 200, { logo: state.formLogos?.[key] || '', description: state.formDescriptions?.[key] || '' })
    }
    if (request.method === 'GET' && url.pathname === '/api/customers') {
      if (!(await requireCapability(request, response, 'customers:read'))) return
      const query = String(url.searchParams.get('q') || '').trim().toLowerCase()
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
      const sort = String(url.searchParams.get('sort') || 'name')
      const direction = String(url.searchParams.get('direction') || 'asc').toLowerCase()
      if (!Object.hasOwn(customerSortSql, sort)) return sendJson(response, 400, { error: 'A coluna de ordenação é inválida.' })
      if (direction !== 'asc' && direction !== 'desc') return sendJson(response, 400, { error: 'A direção de ordenação é inválida.' })
      let filters = {}
      const rawFilters = url.searchParams.get('filters')
      if (rawFilters) {
        try {
          filters = JSON.parse(rawFilters)
        } catch {
          return sendJson(response, 400, { error: 'Os filtros por coluna são inválidos.' })
        }
      }
      return sendJson(response, 200, await queryCustomers(query, offset, limit, filters, sort, direction))
    }
    if (request.method === 'POST' && url.pathname === '/api/customers/import') {
      if (!(await requireCapability(request, response, 'customers:import'))) return
      const value = await bodyJson(request)
      if (!Array.isArray(value.customers) || value.customers.length < 1 || value.customers.length > 500) {
        return sendJson(response, 400, { error: 'Cada envio deve conter de 1 a 500 clientes.' })
      }
      const result = await importCustomers(String(value.sourceSystem || 'verdant-export'), value.customers)
      return sendJson(response, 200, result)
    }
    if (request.method === 'GET' && url.pathname === '/api/state') {
      if (!(await requireCapability(request, response, 'business:read'))) return
      return sendJson(response, 200, await readState())
    }
    if (request.method === 'PUT' && url.pathname === '/api/state') {
      if (!(await requireCapability(request, response, 'business:write'))) return
      const next = await bodyJson(request, STATE_BODY_LIMIT_BYTES)
      if (!Array.isArray(next.events) || !Array.isArray(next.forms) || !Array.isArray(next.people) || !Array.isArray(next.registrations)) {
        return sendJson(response, 400, { error: 'Estrutura de dados inválida.' })
      }
      if (!Number.isSafeInteger(next.revision) || next.revision < 0) {
        return sendJson(response, 400, { error: 'A revisão do estado está ausente ou é inválida. Recarregue o painel antes de salvar.' })
      }
      const result = await queueStateMutation(async () => {
        const current = await readState()
        if (current.revision !== next.revision) return { conflict: true, state: current }
        const saved = {
          ...next,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
        }
        if (!await saveStateIfRevision(saved, current.revision)) {
          currentState = undefined
          return { conflict: true, state: await readState() }
        }
        return { conflict: false, state: saved }
      })
      if (result.conflict) return sendJson(response, 409, { error: 'Outra pessoa alterou os dados. O painel foi atualizado; reaplique sua alteração.', state: result.state })
      return sendJson(response, 200, result.state)
    }
    if (request.method === 'POST' && url.pathname === '/api/registrations') {
      const payload = await bodyJson(request)
      const registration = await queueStateMutation(async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const state = await readState()
          const created = validateSubmission(state, payload)
          const next = {
            ...state,
            registrations: [created, ...state.registrations],
            revision: state.revision + 1,
            updatedAt: new Date().toISOString(),
          }
          if (await saveStateIfRevision(next, state.revision)) return created
          currentState = undefined
        }
        throw requestError('O estado foi atualizado por outra gravação. Tente enviar a inscrição novamente.', 409)
      })
      return sendJson(response, 201, { ok: true })
    }
    if (request.method === 'GET') return serveStatic(request, response, url.pathname)
    return sendJson(response, 404, { error: 'Rota não encontrada.' })
  } catch (error) {
    return sendJson(response, Number(error?.status) || 500, { error: error instanceof Error ? error.message : 'Erro ao processar a solicitação.' })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Central Verdant disponível na porta ${port} (${mysqlConfigured ? 'MySQL iniciando' : 'JSON'})`)
})

initializeMySql().then(async () => {
  await cleanupTeamAndRostersOnce()
  await seedRequestedTestStaff()
  if (mysqlConfigured) {
    mysqlStartupState = 'ready'
    console.log('Conexão MySQL inicializada.')
  }
}).catch((error) => {
  mysqlStartupState = 'unavailable'
  console.error('Falha ao inicializar MySQL; o servidor HTTP continuará disponível:', error)
})
