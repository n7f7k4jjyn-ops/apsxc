import { compareNames, normalizeName } from './zig-matching.mjs'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RUNS = 50

export function pendingKey(entry) {
  if (entry.zigId) return `zig:${entry.zigId}`
  const raw = entry.raw || {}
  return `buyer:${entry.phone?.normalized || raw.document || ''}|${normalizeName(entry.name)}`
}

function createSourceId(entry) {
  if (entry.zigId) return entry.zigId
  const raw = entry.raw || {}
  if (raw.phoneKey) return `buyer:${raw.phoneKey}`
  return raw.document ? `buyer:doc:${raw.document}` : ''
}

function sameStore(ref, lojaId) {
  return String(ref?.lojaId || '') === String(lojaId || '')
}

// Só preenche campos vazios e acrescenta o vínculo Zig; nunca altera dado existente.
export function applyZigToCustomer(customer, entry, { lojaId, now, usedCpfKeys }) {
  const raw = entry.raw || {}
  const refs = Array.isArray(customer.zigRefs) ? customer.zigRefs : []
  if (entry.zigId && refs.some((ref) => sameStore(ref, lojaId) && String(ref.id) !== String(entry.zigId))) return { conflict: 'conflicting_zig_id', changes: [] }
  const next = { ...customer }
  const changes = []
  if (entry.zigId && !refs.some((ref) => sameStore(ref, lojaId) && String(ref.id) === String(entry.zigId))) {
    next.zigRefs = [...refs, { system: 'zig', id: String(entry.zigId), lojaId: lojaId || null, linkedAt: now }]
    changes.push('vinculo')
  }
  const filled = []
  if (!String(customer.cpf || '').trim() && raw.documentKind === 'cpf' && raw.document && !usedCpfKeys.has(raw.document)) {
    next.cpf = raw.document
    next.cpfValid = true
    next.cpfKey = raw.document
    usedCpfKeys.add(raw.document)
    filled.push('documento')
  }
  if (!String(customer.email || '').trim() && typeof raw.email === 'string' && EMAIL.test(raw.email)) {
    next.email = raw.email
    next.emailKey = raw.email
    filled.push('email')
  }
  if (!String(customer.birthday || '').trim() && raw.birthdate) {
    next.birthday = raw.birthdate
    filled.push('nascimento')
  }
  if (filled.length) next.zigFilledFields = [...new Set([...(Array.isArray(customer.zigFilledFields) ? customer.zigFilledFields : []), ...filled])]
  changes.push(...filled)
  if (!changes.length) return { customer, changes }
  next.updatedAt = now
  return { customer: next, changes }
}

function indexCustomers(customers, lojaId) {
  const usedCpfKeys = new Set()
  const zigSources = new Set()
  const zigLinked = new Map()
  for (const customer of customers) {
    const cpf = String(customer.cpfKey || customer.cpf || '').replace(/\D/g, '')
    if (cpf.length === 11) usedCpfKeys.add(cpf)
    if (customer.sourceSystem === 'zig' && customer.sourceId) zigSources.add(String(customer.sourceId))
    for (const ref of Array.isArray(customer.zigRefs) ? customer.zigRefs : []) if (sameStore(ref, lojaId)) zigLinked.set(String(ref.id), String(customer.id))
  }
  return { usedCpfKeys, zigSources, zigLinked }
}

function pendingFromEntry(entry, reasons = entry.reasons) {
  const raw = entry.raw || {}
  return {
    key: pendingKey(entry),
    zigId: entry.zigId || null,
    name: entry.name,
    phone: { raw: entry.phone?.raw || '', kind: entry.phone?.kind || '', normalized: entry.phone?.normalized || null },
    documentMasked: entry.document?.masked || null,
    email: entry.email || null,
    birthdate: entry.birthdate || null,
    reasons: [...reasons],
    matches: (entry.matches || []).map((match) => ({ source: match.source, id: match.id, name: match.name })),
    eventIds: [...(raw.eventIds || [])],
    raw: { document: raw.document || '', documentKind: raw.documentKind || 'empty', email: raw.email || '', birthdate: raw.birthdate || '', phone: raw.phone || '', phoneKey: raw.phoneKey || '' },
  }
}

// Plano puro: nada é gravado aqui.
export function planZigWrites(groups, customers, { lojaId = '', now = new Date().toISOString() } = {}) {
  const byId = new Map(customers.map((customer) => [String(customer.id), customer]))
  const { usedCpfKeys, zigSources, zigLinked } = indexCustomers(customers, lojaId)
  const touched = new Map()
  const updates = []
  const creates = []
  const skipped = []
  const pending = []
  let kept = 0
  let registrationOnly = 0

  for (const entry of groups.linked) {
    const match = entry.matches.find((item) => item.source === 'customer')
    if (!match) { registrationOnly++; continue }
    const base = touched.get(String(match.id)) ?? byId.get(String(match.id))
    if (!base) { skipped.push({ name: entry.name, zigId: entry.zigId, reason: 'customer_not_found' }); continue }
    if (entry.zigId && zigLinked.has(String(entry.zigId)) && zigLinked.get(String(entry.zigId)) !== String(match.id)) {
      skipped.push({ name: entry.name, zigId: entry.zigId, reason: 'zig_id_linked_elsewhere' })
      continue
    }
    const result = applyZigToCustomer(base, entry, { lojaId, now, usedCpfKeys })
    if (result.conflict) skipped.push({ name: entry.name, zigId: entry.zigId, reason: result.conflict })
    else if (result.changes.length) {
      touched.set(String(match.id), result.customer)
      updates.push({ customerId: String(match.id), zigId: entry.zigId, name: entry.name, changes: result.changes })
      if (entry.zigId) zigLinked.set(String(entry.zigId), String(match.id))
    } else kept++
  }

  const createdIdentity = []
  const seenSources = new Set()
  for (const entry of groups.created) {
    const sourceId = createSourceId(entry)
    if (!sourceId) { skipped.push({ name: entry.name, zigId: entry.zigId, reason: 'no_identifier' }); continue }
    if (zigSources.has(sourceId) || seenSources.has(sourceId) || (entry.zigId && zigLinked.has(String(entry.zigId)))) { kept++; continue }
    const phoneKey = entry.raw?.phoneKey || ''
    if (phoneKey && createdIdentity.some((other) => other.phoneKey === phoneKey && compareNames(other.name, entry.name) !== 'none')) {
      pending.push(pendingFromEntry(entry, ['zig_possible_duplicate']))
      continue
    }
    seenSources.add(sourceId)
    createdIdentity.push({ phoneKey, name: entry.name })
    const raw = entry.raw || {}
    const cpf = raw.documentKind === 'cpf' && raw.document && !usedCpfKeys.has(raw.document) ? raw.document : ''
    if (cpf) usedCpfKeys.add(cpf)
    creates.push({
      key: pendingKey(entry),
      zigId: entry.zigId,
      input: { sourceId, name: entry.name, cpf, email: raw.email || '', phone: raw.phone || '', birthday: raw.birthdate || '', sourceEventId: raw.eventIds?.[0] || '', sourceSystems: 'zig' },
    })
  }
  for (const entry of groups.divergent) pending.push(pendingFromEntry(entry))

  const fills = {}
  for (const update of updates) for (const field of update.changes) fills[field] = (fills[field] || 0) + 1
  return {
    updates, creates, pending, skipped, touchedCustomers: [...touched.values()],
    summary: { updates: updates.length, creates: creates.length, kept, registrationOnly, skipped: skipped.length, pending: pending.length, fills },
  }
}

export function mergePending(existing, incoming, now) {
  const byKey = new Map(existing.map((item) => [item.key, item]))
  let added = 0
  let refreshed = 0
  let decided = 0
  for (const item of incoming) {
    const current = byKey.get(item.key)
    if (!current) {
      byKey.set(item.key, { ...item, status: 'open', firstSeenAt: now, lastSeenAt: now })
      added++
    } else if (current.status !== 'open') {
      decided++
    } else {
      byKey.set(item.key, { ...current, ...item, status: 'open', firstSeenAt: current.firstSeenAt, lastSeenAt: now })
      refreshed++
    }
  }
  return { items: [...byKey.values()], added, refreshed, decided }
}

export function publicPending(item) {
  const { raw: _raw, ...rest } = item
  return rest
}

export function pushRun(runs, run) {
  return [...runs, run].slice(-MAX_RUNS)
}

export class ZigApplyError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

// Resolução manual de uma pendência: vincular a um cliente candidato, criar novo ou ignorar.
export function resolvePending(item, action, { customers, lojaId = '', now, customerId = '' }) {
  if (item.status !== 'open') throw new ZigApplyError('Esta pendência já foi resolvida.', 409)
  if (action === 'ignore') return { status: 'ignored' }
  const entry = { zigId: item.zigId, name: item.name, phone: { normalized: item.phone?.normalized || null, raw: item.phone?.raw || '' }, raw: item.raw }
  const indexes = indexCustomers(customers, lojaId)
  if (action === 'link') {
    const candidate = item.matches.find((match) => match.source === 'customer' && String(match.id) === String(customerId))
    if (!candidate) throw new ZigApplyError('Escolha um dos clientes sugeridos para esta pendência.')
    const customer = customers.find((entryCustomer) => String(entryCustomer.id) === String(customerId))
    if (!customer) throw new ZigApplyError('O cliente escolhido não existe mais.', 409)
    if (item.zigId && indexes.zigLinked.has(String(item.zigId)) && indexes.zigLinked.get(String(item.zigId)) !== String(customer.id)) throw new ZigApplyError('Este ID Zig já está vinculado a outro cliente.', 409)
    const result = applyZigToCustomer(customer, entry, { lojaId, now, usedCpfKeys: indexes.usedCpfKeys })
    if (result.conflict) throw new ZigApplyError('Este cliente já está vinculado a outro ID Zig.', 409)
    return { status: 'linked', customerId: String(customer.id), customer: result.changes.length ? result.customer : null, changes: result.changes }
  }
  if (action === 'create') {
    const sourceId = createSourceId(entry)
    if (!sourceId) throw new ZigApplyError('Sem identificador para criar o cliente.')
    if (indexes.zigSources.has(sourceId) || (item.zigId && indexes.zigLinked.has(String(item.zigId)))) throw new ZigApplyError('Este cadastro Zig já existe como cliente.', 409)
    const raw = item.raw || {}
    const cpf = raw.documentKind === 'cpf' && raw.document && !indexes.usedCpfKeys.has(raw.document) ? raw.document : ''
    return {
      status: 'created',
      create: { key: item.key, zigId: item.zigId, input: { sourceId, name: item.name, cpf, email: raw.email || '', phone: raw.phone || '', birthday: raw.birthdate || '', sourceEventId: item.eventIds?.[0] || '', sourceSystems: 'zig' } },
    }
  }
  throw new ZigApplyError('Ação inválida.')
}
