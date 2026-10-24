// Mescla um dump mysqldump/MariaDB no banco de destino SEM apagar nada.
//
//   node scripts/import-dump.mjs <dump.sql>            -> dry-run (padrão): só mostra o relatório
//   node scripts/import-dump.mjs <dump.sql> --apply    -> grava (faz backup antes)
//
// Opções: --backup-dir <dir> (padrão storage/backups) | --include-sessions
// Usa DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD do ambiente.
//
// Regras:
//  * só no destino  -> preservado; só no dump -> importado; nunca há DELETE.
//  * mesmo registro nos dois -> vence o de updated_at/updatedAt mais recente;
//    sem timestamp, o destino é mantido e os campos ausentes são completados pelo dump.
//  * segredos (secrets, passwordHash, token...) existentes no destino nunca são sobrescritos.
//  * finance nunca é tocado. verdant_sessions só entra com --include-sessions.
//  * verdant_state: união por id das coleções + migrateVerdantState no resultado.
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { migrateVerdantState } from '../lib/verdant-state-migration.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const backupFlag = args.indexOf('--backup-dir')
const backupDir = backupFlag >= 0 ? args[backupFlag + 1] : path.join(root, 'storage', 'backups')
const apply = args.includes('--apply')
const includeSessions = args.includes('--include-sessions')
const conflictsFlag = args.indexOf('--conflicts')
const conflictCollections = conflictsFlag >= 0 ? args[conflictsFlag + 1].split(',') : ['people']
const valueIndexes = [backupFlag, conflictsFlag].filter((i) => i >= 0).map((i) => i + 1)
const file = args.find((a, i) => !a.startsWith('--') && !valueIndexes.includes(i))

if (!file || !fs.existsSync(file)) {
  console.error('Uso: node scripts/import-dump.mjs <dump.sql> [--apply] [--backup-dir <dir>] [--include-sessions]')
  process.exit(1)
}

// ---------- parser do dump ----------
const ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', 0: '\0', Z: '\x1a' }

function parseTuples(text) {
  const rows = []
  let i = 0
  const n = text.length
  while (i < n) {
    while (i < n && text[i] !== '(') i += 1
    if (i >= n) break
    i += 1
    const row = []
    for (;;) {
      while (text[i] === ' ') i += 1
      if (text[i] === "'") {
        i += 1
        let out = ''
        for (;;) {
          const c = text[i]
          if (c === '\\') {
            const next = text[i + 1]
            out += next in ESCAPES ? ESCAPES[next] : next
            i += 2
          } else if (c === "'") {
            if (text[i + 1] === "'") { out += "'"; i += 2 } else { i += 1; break }
          } else if (c === undefined) {
            throw new Error('String SQL não terminada no dump')
          } else { out += c; i += 1 }
        }
        row.push(out)
      } else {
        let j = i
        while (j < n && text[j] !== ',' && text[j] !== ')') j += 1
        const token = text.slice(i, j).trim()
        row.push(/^NULL$/i.test(token) ? null : token)
        i = j
      }
      if (text[i] === ',') { i += 1; continue }
      if (text[i] === ')') { i += 1; break }
      throw new Error(`Dump malformado perto da posição ${i}`)
    }
    rows.push(row)
  }
  return rows
}

async function parseDump(filePath) {
  const columns = {}
  const creates = {}
  const rows = {}
  const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity })
  let createTable = null
  let insert = null
  const flush = () => {
    const parsed = parseTuples(insert.text)
    rows[insert.table].push(...parsed.map((r) => Object.fromEntries(columns[insert.table].map((c, k) => [c, r[k]]))))
    insert = null
  }
  for await (const line of rl) {
    if (createTable) {
      creates[createTable] += `${line}\n`
      const col = line.match(/^ {2}`(\w+)` /)
      if (col) columns[createTable].push(col[1])
      if (line.startsWith(') ENGINE')) createTable = null
      continue
    }
    if (insert) {
      insert.text += `${line}\n`
      if (line.endsWith(';')) flush()
      continue
    }
    const create = line.match(/^CREATE TABLE `(\w+)`/)
    if (create) {
      createTable = create[1]
      columns[createTable] = []
      creates[createTable] = `${line}\n`
      rows[createTable] ||= []
      continue
    }
    const ins = line.match(/^INSERT INTO `(\w+)` VALUES(.*)$/)
    if (ins) {
      rows[ins[1]] ||= []
      insert = { table: ins[1], text: ins[2] ? `${ins[2]}\n` : '' }
      if (insert.text.trimEnd().endsWith(';')) flush()
    }
  }
  return { columns, creates, rows }
}

// ---------- merge de JSON ----------
const SENSITIVE = /secret|password|token|api_?key|private_?key/i
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length)
const canon = (v) => JSON.stringify(v, (_k, val) => (isObj(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : 1))) : val))
const stamp = (v) => (isObj(v) ? Date.parse(v.updatedAt ?? '') : Number.NaN)
const newStats = () => ({ added: 0, updated: 0, kept: 0, destOnly: 0, conflictsNoTimestamp: 0 })

function identity(item) {
  if (!isObj(item)) return null
  const id = item.id ?? item.username
  return id === undefined || id === null ? null : String(id)
}

function mergeWith(dest, src, prefer) {
  const out = {}
  for (const k of [...new Set([...Object.keys(dest), ...Object.keys(src)])]) {
    const d = dest[k]
    const s = src[k]
    if (SENSITIVE.test(k)) { out[k] = isEmpty(d) ? s : d; continue }
    if (d === undefined) { out[k] = s; continue }
    if (s === undefined) { out[k] = d; continue }
    if (Array.isArray(d) && Array.isArray(s)) out[k] = mergeArray(d, s)
    else if (isObj(d) && isObj(s)) out[k] = Number.isNaN(stamp(d)) || Number.isNaN(stamp(s)) ? mergeWith(d, s, prefer) : mergeRecord(d, s)
    else if (typeof d === 'number' && typeof s === 'number' && /^(version|revision)$/.test(k)) out[k] = Math.max(d, s)
    else {
      const [first, second] = prefer === 'src' ? [s, d] : [d, s]
      out[k] = isEmpty(first) ? second : first
    }
  }
  return out
}

function mergeRecord(dest, src, counters) {
  const td = stamp(dest)
  const ts = stamp(src)
  if (counters && (Number.isNaN(td) || Number.isNaN(ts)) && canon(dest) !== canon(src)) counters.conflictsNoTimestamp += 1
  return mergeWith(dest, src, ts > td ? 'src' : 'dest')
}

function mergeArray(dest, src, counters) {
  if (!dest.every(isObj) || !src.every(isObj)) {
    const seen = new Set(dest.map(canon))
    const out = [...dest]
    for (const item of src) if (!seen.has(canon(item))) { out.push(item); seen.add(canon(item)) }
    if (counters) counters.added += out.length - dest.length
    return out
  }
  const out = [...dest]
  const byId = new Map()
  const byComposite = new Map()
  const composite = (item) => (item.key !== undefined && item.eventId !== undefined ? `${item.key}|${item.eventId}` : null)
  out.forEach((item, idx) => {
    const id = identity(item)
    if (id !== null) byId.set(id, idx)
    const c = composite(item)
    if (c) byComposite.set(c, idx)
  })
  const matched = new Set()
  const seenJson = new Set(out.filter((i) => identity(i) === null).map(canon))
  for (const item of src) {
    const id = identity(item)
    let idx = id !== null ? byId.get(id) : undefined
    if (idx === undefined && composite(item)) idx = byComposite.get(composite(item))
    if (idx !== undefined) {
      const before = out[idx]
      const merged = mergeRecord(before, item, counters)
      if (counters && !matched.has(idx)) {
        if (canon(merged) === canon(before)) counters.kept += 1
        else counters.updated += 1
      }
      matched.add(idx)
      out[idx] = merged
    } else if (id === null && seenJson.has(canon(item))) {
      if (counters) counters.kept += 1
    } else {
      out.push(item)
      if (id !== null) byId.set(id, out.length - 1)
      else seenJson.add(canon(item))
      if (counters) counters.added += 1
    }
  }
  if (counters) counters.destOnly += dest.length - matched.size
  return out
}

function mergeMap(dest, src, counters) {
  const out = { ...dest }
  for (const [k, s] of Object.entries(src)) {
    if (!(k in dest)) { out[k] = s; counters.added += 1; continue }
    const d = dest[k]
    const merged = isObj(d) && isObj(s) ? mergeRecord(d, s, counters) : isEmpty(d) ? s : d
    if (canon(merged) === canon(d)) counters.kept += 1
    else counters.updated += 1
    out[k] = merged
  }
  counters.destOnly += Object.keys(dest).filter((k) => !(k in src)).length
  return out
}

function mergePayload(key, dest, src, stats) {
  if (Array.isArray(dest) && Array.isArray(src)) return mergeArray(dest, src, (stats[key] ||= newStats()))
  if (!isObj(dest) || !isObj(src)) return dest
  const out = {}
  for (const k of [...new Set([...Object.keys(dest), ...Object.keys(src)])]) {
    const d = dest[k]
    const s = src[k]
    const label = `${key}.${k}`
    if (SENSITIVE.test(k)) out[k] = isEmpty(d) ? s : d
    else if (d === undefined) { out[k] = s; if (Array.isArray(s)) (stats[label] ||= newStats()).added += s.length }
    else if (s === undefined) out[k] = d
    else if (Array.isArray(d) && Array.isArray(s)) out[k] = mergeArray(d, s, (stats[label] ||= newStats()))
    else if (isObj(d) && isObj(s)) {
      const entries = Object.values({ ...d, ...s })
      out[k] = entries.length && entries.every(isObj) ? mergeMap(d, s, (stats[label] ||= newStats())) : mergeWith(d, s, 'dest')
    } else if (/^(version|revision)$/.test(k) && typeof d === 'number' && typeof s === 'number') out[k] = Math.max(d, s)
    else if (k === 'updatedAt') out[k] = String(d) > String(s) ? d : s
    else out[k] = isEmpty(d) ? s : d
  }
  return out
}

// ---------- relatórios detalhados ----------
const redact = (value) => {
  const text = JSON.stringify(value, (k, v) => (SENSITIVE.test(k) ? '[oculto]' : v))
  if (text === undefined) return '(ausente)'
  return text.length > 140 ? `${text.slice(0, 137)}...` : text
}

function describeConflicts(destArr, srcArr) {
  const byId = new Map(destArr.filter(isObj).map((item) => [identity(item), item]))
  const out = []
  for (const s of srcArr.filter(isObj)) {
    const d = byId.get(identity(s))
    if (!d || canon(d) === canon(s)) continue
    const td = stamp(d)
    const ts = stamp(s)
    const fields = [...new Set([...Object.keys(d), ...Object.keys(s)])]
      .filter((k) => canon(d[k]) !== canon(s[k]))
      .map((k) => {
        const sensitive = SENSITIVE.test(k)
        const merged = mergeWith({ [k]: d[k] }, { [k]: s[k] }, ts > td ? 'src' : 'dest')[k]
        let decision = 'destino mantido'
        if (!sensitive && canon(merged) !== canon(d[k])) decision = isEmpty(d[k]) ? 'dump preenche campo vazio' : Array.isArray(merged) ? 'união das listas' : isObj(merged) ? 'união dos campos (destino prevalece nas chaves iguais)' : 'dump prevalece (mais recente)'
        if (sensitive) decision = isEmpty(d[k]) ? 'dump preenche campo vazio' : 'destino mantido (campo sensível)'
        return { campo: k, destino: sensitive ? '[oculto]' : redact(d[k]), dump: sensitive ? '[oculto]' : redact(s[k]), decisão: decision }
      })
    out.push({
      id: identity(s),
      timestamp: `destino: ${Number.isNaN(td) ? 'ausente' : d.updatedAt} | dump: ${Number.isNaN(ts) ? 'ausente' : s.updatedAt}`,
      decisão: Number.isNaN(td) || Number.isNaN(ts) ? 'sem timestamp comparável: destino prevalece, dump só completa' : ts > td ? 'dump mais recente prevalece' : 'destino igual/mais recente prevalece',
      fields,
    })
  }
  return out
}

function summarizeState(dest, src, merged, stats) {
  const size = (v) => (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : undefined)
  const rows = []
  for (const k of [...new Set([...Object.keys(dest), ...Object.keys(src), ...Object.keys(merged)])]) {
    const [a, b, c] = [dest[k], src[k], merged[k]]
    if ([a, b, c].every((v) => size(v) === undefined) && !/^(version|revision)$/.test(k)) continue
    const st = stats[`verdant_state.${k}`] || newStats()
    const scalar = /^(version|revision)$/.test(k)
    rows.push({
      item: k, antes: scalar ? a : size(a) ?? '-', dump: scalar ? b : size(b) ?? '-', resultado: scalar ? c : size(c) ?? '-',
      adicionados: st.added, atualizados: st.updated, preservados: st.kept + st.destOnly, 'só no destino': st.destOnly, conflitos: st.conflictsNoTimestamp,
    })
  }
  return rows
}

// ---------- plano ----------
async function buildPlan(connection, dump) {
  const ops = []
  const report = []
  const notes = []
  const details = { stateSummary: null, conflicts: {} }
  const q = async (sql) => (await connection.query(sql))[0]
  const exists = async (t) => (await q(`SHOW TABLES LIKE '${t}'`)).length > 0
  const load = async (t) => ((await exists(t)) ? q(`SELECT * FROM \`${t}\`${t === 'verdant_app_data' ? ' FOR UPDATE' : ''}`) : [])
  const current = {}
  for (const t of Object.keys(dump.rows)) current[t] = await load(t)
  const ids = (table) => new Set((dump.rows[table] || []).map((r) => r.id))

  // verdant_app_data
  const destApp = new Map(current.verdant_app_data.map((r) => [r.store_key, r]))
  const seed = JSON.parse(await readFile(path.join(root, 'src', 'features', 'verdant', 'seed.json'), 'utf8'))
  for (const row of dump.rows.verdant_app_data || []) {
    const key = row.store_key
    if (key === 'finance') { notes.push('finance presente no dump: ignorado (nunca é tocado).'); continue }
    const dest = destApp.get(key)
    if (!dest) {
      ops.push({ sql: 'INSERT INTO verdant_app_data (store_key, payload) VALUES (?, ?)', params: [key, row.payload] })
      report.push({ name: `verdant_app_data.${key}`, ...newStats(), added: 1 })
      continue
    }
    let d
    let s
    try { d = JSON.parse(dest.payload); s = JSON.parse(row.payload) } catch {
      notes.push(`${key}: JSON inválido em um dos lados, destino mantido.`)
      report.push({ name: `verdant_app_data.${key}`, ...newStats(), kept: 1 })
      continue
    }
    const stats = {}
    let merged = mergePayload(key, d, s, stats)
    if (key === 'verdant_state') {
      for (const name of conflictCollections) {
        if (Array.isArray(d[name]) && Array.isArray(s[name])) details.conflicts[name] = describeConflicts(d[name], s[name])
      }
      merged = migrateVerdantState(merged, seed).state
    }
    const changed = canon(merged) !== canon(d)
    if (changed && key === 'verdant_state') merged.revision = Math.max(Number(d.revision) || 0, Number(s.revision) || 0, Number(merged.revision) || 0) + 1
    if (key === 'verdant_state') details.stateSummary = summarizeState(d, s, merged, stats)
    if (changed) ops.push({ sql: 'UPDATE verdant_app_data SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE store_key = ?', params: [JSON.stringify(merged), key] })
    report.push({ name: `verdant_app_data.${key} (documento)`, ...newStats(), updated: changed ? 1 : 0, kept: changed ? 0 : 1 })
    for (const [label, st] of Object.entries(stats)) report.push({ name: `  ↳ ${label}`, ...st })
  }

  // verdant_customers
  const destCustomers = new Map(current.verdant_customers.map((r) => [r.id, r]))
  const cpfOwner = new Map(current.verdant_customers.filter((r) => r.cpf_key).map((r) => [r.cpf_key, r.id]))
  const idMap = new Map()
  const cust = newStats()
  for (const row of dump.rows.verdant_customers || []) {
    const dest = destCustomers.get(row.id)
    const owner = row.cpf_key ? cpfOwner.get(row.cpf_key) : undefined
    if (!dest) {
      if (owner && owner !== row.id) {
        idMap.set(row.id, owner)
        cust.conflictsNoTimestamp += 1
        notes.push(`customers: ${row.id} tem o mesmo CPF de ${owner}; não inserido, fontes remapeadas para ${owner}.`)
        continue
      }
      const cols = Object.keys(row)
      ops.push({ sql: `INSERT INTO verdant_customers (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`, params: cols.map((c) => row[c]) })
      destCustomers.set(row.id, row)
      if (row.cpf_key) cpfOwner.set(row.cpf_key, row.id)
      cust.added += 1
    } else if (String(row.updated_at) > String(dest.updated_at)) {
      if (row.cpf_key && cpfOwner.get(row.cpf_key) && cpfOwner.get(row.cpf_key) !== row.id) {
        cust.kept += 1
        notes.push(`customers: ${row.id} mais novo no dump, mas o CPF pertence a outro cliente; destino mantido.`)
        continue
      }
      const cols = Object.keys(row).filter((c) => c !== 'id' && c !== 'created_at')
      ops.push({ sql: `UPDATE verdant_customers SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`, params: [...cols.map((c) => row[c]), row.id] })
      if (dest.cpf_key && dest.cpf_key !== row.cpf_key) cpfOwner.delete(dest.cpf_key)
      if (row.cpf_key) cpfOwner.set(row.cpf_key, row.id)
      cust.updated += 1
    } else cust.kept += 1
  }
  const dumpCustomerIds = ids('verdant_customers')
  cust.destOnly = current.verdant_customers.filter((r) => !dumpCustomerIds.has(r.id)).length
  report.push({ name: 'verdant_customers', ...cust })

  // verdant_customer_sources
  const destSources = new Map(current.verdant_customer_sources.map((r) => [`${r.source_system}|${r.source_id}`, r]))
  const dumpSourceKeys = new Set((dump.rows.verdant_customer_sources || []).map((r) => `${r.source_system}|${r.source_id}`))
  const src = newStats()
  for (const row of dump.rows.verdant_customer_sources || []) {
    const k = `${row.source_system}|${row.source_id}`
    const customerId = idMap.get(row.customer_id) || row.customer_id
    if (destSources.has(k)) {
      src.kept += 1
      if (destSources.get(k).customer_id !== customerId) {
        src.conflictsNoTimestamp += 1
        notes.push(`sources: ${k} aponta para clientes diferentes; destino mantido.`)
      }
    } else if (!destCustomers.has(customerId)) {
      src.kept += 1
      notes.push(`sources: ${k} ignorada, cliente ${customerId} inexistente.`)
    } else {
      ops.push({ sql: 'INSERT INTO verdant_customer_sources (source_system, source_id, customer_id, created_at) VALUES (?, ?, ?, ?)', params: [row.source_system, row.source_id, customerId, row.created_at] })
      src.added += 1
    }
  }
  src.destOnly = [...destSources.keys()].filter((k) => !dumpSourceKeys.has(k)).length
  report.push({ name: 'verdant_customer_sources', ...src })

  // candidaturas e inscrições (usa payload.updatedAt quando existir)
  for (const table of ['verdant_job_applications', 'verdant_team_registrations']) {
    const destRows = new Map(current[table].map((r) => [r.id, r]))
    const s = newStats()
    for (const row of dump.rows[table] || []) {
      const dest = destRows.get(row.id)
      if (!dest) {
        ops.push({ sql: `INSERT INTO ${table} (id, created_at, payload) VALUES (?, ?, ?)`, params: [row.id, row.created_at, row.payload] })
        s.added += 1
        continue
      }
      let newer = false
      try { newer = Date.parse(JSON.parse(row.payload).updatedAt) > Date.parse(JSON.parse(dest.payload).updatedAt) } catch { /* sem timestamp */ }
      if (newer) {
        ops.push({ sql: `UPDATE ${table} SET payload = ? WHERE id = ?`, params: [row.payload, row.id] })
        s.updated += 1
      } else s.kept += 1
    }
    const dumpIds = ids(table)
    s.destOnly = current[table].filter((r) => !dumpIds.has(r.id)).length
    report.push({ name: table, ...s })
  }

  // sessões
  if (includeSessions) {
    const destSessions = new Set(current.verdant_sessions.map((r) => r.token_hash))
    const s = newStats()
    for (const row of dump.rows.verdant_sessions || []) {
      if (destSessions.has(row.token_hash)) { s.kept += 1; continue }
      ops.push({ sql: 'INSERT INTO verdant_sessions (token_hash, username, email, expires_at) VALUES (?, ?, ?, ?)', params: [row.token_hash, row.username, row.email, row.expires_at] })
      s.added += 1
    }
    report.push({ name: 'verdant_sessions', ...s })
  } else notes.push(`verdant_sessions: ${(dump.rows.verdant_sessions || []).length} sessões do dump ignoradas (use --include-sessions).`)

  return { ops, report, notes, current, details }
}

// ---------- execução ----------
const dump = await parseDump(file)
const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true,
})

try {
  await connection.query("SET time_zone = '+00:00'")
  if (apply) {
    for (const t of ['verdant_app_data', 'verdant_customers', 'verdant_customer_sources', 'verdant_job_applications', 'verdant_team_registrations', 'verdant_sessions']) {
      if (dump.creates[t]) await connection.query(dump.creates[t].replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS '))
    }
  }
  await connection.beginTransaction()
  const plan = await buildPlan(connection, dump)

  console.log(`\n${apply ? 'APLICAÇÃO REAL' : 'DRY-RUN (nada será gravado)'} — ${plan.ops.length} operações planejadas\n`)
  console.table(plan.report.map((r) => ({
    'tabela/chave': r.name, adicionados: r.added, atualizados: r.updated, mantidos: r.kept, 'só no destino': r.destOnly, 'conflitos s/ timestamp': r.conflictsNoTimestamp,
  })))
  for (const note of plan.notes) console.log(`- ${note}`)

  if (plan.details.stateSummary) {
    console.log('\nverdant_state — antes → dump → resultado do merge')
    console.table(plan.details.stateSummary)
  }
  for (const [name, list] of Object.entries(plan.details.conflicts)) {
    console.log(`\nConflitos em verdant_state.${name}: ${list.length} registro(s) diferem entre destino e dump`)
    for (const item of list) {
      console.log(`\n[${item.id}] ${item.timestamp}\n  decisão: ${item.decisão}`)
      for (const f of item.fields) console.log(`  - ${f.campo}: destino=${f.destino} | dump=${f.dump} -> ${f.decisão}`)
    }
  }
  console.log('\nfinance: não é lido nem gravado por este script.')
  console.log(`verdant_sessions: ${includeSessions ? 'serão importadas (--include-sessions)' : 'ignoradas'}.`)

  if (!apply) {
    await connection.rollback()
    console.log('\nNenhuma alteração feita. Rode com --apply para gravar.')
  } else {
    await mkdir(backupDir, { recursive: true })
    const backupFile = path.join(backupDir, `import-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    await writeFile(backupFile, JSON.stringify(plan.current, null, 2), { flag: 'wx' })
    console.log(`\nBackup salvo em ${backupFile}`)
    for (const op of plan.ops) await connection.execute(op.sql, op.params)
    await connection.commit()
    console.log('Importação concluída.')
  }
} catch (error) {
  await connection.rollback().catch(() => {})
  console.error('Falha; nenhuma alteração foi confirmada:', error.message)
  process.exitCode = 1
} finally {
  await connection.end()
}
