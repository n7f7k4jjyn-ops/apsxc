import { randomUUID } from 'node:crypto'

const types = ['payable', 'receivable']
const categories = ['general', 'team', 'dj', 'sales']
const unlinked = category => category === 'general' || category === 'sales'
const statuses = ['pending', 'settled', 'cancelled']
const methods = ['', 'cash', 'pix', 'transfer', 'card', 'other']
const fields = ['externalId', 'type', 'category', 'description', 'counterparty', 'beneficiaryId', 'eventId', 'amountCents', 'dueDate', 'status', 'settledDate', 'paymentMethod', 'notes']
const immutableFields = fields.filter(key => !['status', 'settledDate', 'paymentMethod'].includes(key))
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
export const emptyFinance = () => ({ revision: 0, entries: [] })

export function validFinanceDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0, 4) !== '0000' &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

function text(value, key, required = false, limit = 500) {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) fail(`Campo financeiro inválido: ${key}.`)
  const controls = key === 'notes' ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/ : /[\u0000-\u001f\u007f-\u009f]/
  if (controls.test(value)) fail(`Campo financeiro contém caracteres de controle: ${key}.`)
  return value.trim()
}

function draft(value) {
  if (!object(value)) fail('Lançamento financeiro inválido.')
  const entry = {}
  for (const key of fields.filter(key => key !== 'amountCents')) {
    entry[key] = text(value[key], key, ['type', 'category', 'description', 'dueDate', 'status'].includes(key), key === 'notes' ? 5000 : key === 'externalId' ? 160 : 500)
  }
  entry.amountCents = value.amountCents
  if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0 || entry.amountCents > 100_000_000_000) fail('Valor deve ser um inteiro positivo em centavos (máximo 100000000000).')
  if (!types.includes(entry.type) || !categories.includes(entry.category) || !statuses.includes(entry.status) || !methods.includes(entry.paymentMethod)) fail('Tipo, categoria, situação ou meio de pagamento inválido.')
  if (!validFinanceDate(entry.dueDate)) fail('Data de vencimento inválida.')
  if (entry.status === 'settled') {
    if (!validFinanceDate(entry.settledDate) || !entry.paymentMethod) fail('Baixa exige data válida e meio de pagamento.')
  } else if (entry.settledDate || entry.paymentMethod) fail('Somente lançamentos baixados podem conter data e meio de pagamento.')
  if (!unlinked(entry.category) && (entry.type !== 'payable' || !entry.beneficiaryId.startsWith(`${entry.category}:`))) fail('Pagamento de equipe/DJ exige conta a pagar e beneficiário correspondente.')
  if (entry.category === 'sales' && entry.type !== 'receivable') fail('Vendas Zig devem ser contas a receber.')
  if (unlinked(entry.category) && (entry.beneficiaryId || !entry.counterparty)) fail('Lançamento geral ou de vendas exige contraparte e não permite beneficiário vinculado.')
  return entry
}

function linkedDraft(value, references, previous) {
  const entry = draft(value)
  if (entry.eventId && entry.eventId !== previous?.eventId && !references.events.some(event => event.id === entry.eventId)) fail('Evento não encontrado.')
  if (!unlinked(entry.category)) {
    const unchanged = previous?.beneficiaryId === entry.beneficiaryId && previous?.category === entry.category
    if (unchanged) entry.counterparty = previous.counterparty
    else {
      const person = references.beneficiaries.find(person => person.id === entry.beneficiaryId && person.kind === entry.category)
      if (!person) fail('Beneficiário não encontrado.')
      entry.counterparty = person.name
    }
  }
  return entry
}

export function validateFinanceStore(value) {
  try {
    if (!object(value) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.entries)) fail('Documento inválido.')
    const ids = new Set(), externalIds = new Set()
    for (const entry of value.entries) {
      const normalized = draft(entry)
      if (fields.some(key => normalized[key] !== entry[key])) fail('Campos persistidos inválidos.')
      text(entry.counterparty, 'counterparty', true)
      if (!text(entry.id, 'id', true) || ids.has(entry.id)) fail('Identificador duplicado.')
      ids.add(entry.id)
      if (entry.externalId && externalIds.has(entry.externalId)) fail('Identificador externo duplicado.')
      if (entry.externalId) externalIds.add(entry.externalId)
      for (const key of ['createdAt', 'updatedAt']) {
        if (typeof entry[key] !== 'string' || !Number.isFinite(Date.parse(entry[key]))) fail('Metadados inválidos.')
      }
      if (!Array.isArray(entry.history) || !entry.history.length) fail('Histórico inválido.')
      for (const item of entry.history) {
        if (!object(item) || !['created', 'updated', 'settled', 'cancelled', 'reopened'].includes(item.action) ||
          !text(item.actor, 'actor', true) || typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at))) fail('Histórico inválido.')
        if (item.before !== undefined || item.after !== undefined) {
          draft(item.before)
          draft(item.after)
        }
      }
    }
    return value
  } catch (cause) {
    throw Object.assign(new Error('Dados financeiros inválidos; o armazenamento foi preservado.', { cause }), { status: 500 })
  }
}

export function changeFinance(document, payload, references, actor, id) {
  validateFinanceStore(document)
  if (!object(payload) || !Number.isSafeInteger(payload.revision) || payload.revision < 0) fail('Revisão financeira inválida.')
  if (payload.revision !== document.revision) fail('O financeiro foi atualizado por outra gravação. Recarregue os dados.', 409)
  if (document.revision >= Number.MAX_SAFE_INTEGER) fail('Limite de revisões atingido.', 409)
  const entries = structuredClone(document.entries)
  const at = new Date().toISOString()
  let imported = 0, skipped = 0
  if (id !== undefined) {
    const index = entries.findIndex(entry => entry.id === id)
    if (index < 0) fail('Lançamento não encontrado.', 404)
    const previous = entries[index]
    const input = { ...previous, ...payload }
    const reopening = previous.status !== 'pending' && input.status === 'pending'
    if (reopening) { input.settledDate = ''; input.paymentMethod = '' }
    const next = linkedDraft(input, references, previous)
    if (previous.status !== 'pending' && (!reopening || immutableFields.some(key => previous[key] !== next[key]))) fail('Reabra o lançamento sem alterar seus dados antes de editá-lo.', 409)
    if (next.externalId && entries.some(entry => entry.id !== id && entry.externalId === next.externalId)) fail('Identificador externo já utilizado.', 409)
    const action = reopening ? 'reopened' : next.status !== previous.status ? next.status : 'updated'
    const before = Object.fromEntries(fields.map(key => [key, previous[key]]))
    entries[index] = { ...next, id, createdAt: previous.createdAt, updatedAt: at, history: [...previous.history, { action, actor, at, before, after: { ...next } }] }
  } else if (payload.bulk !== undefined) {
    const bulk = payload.bulk
    if (!object(bulk) || !Array.isArray(bulk.ids) || !bulk.ids.length || bulk.ids.length > 1000 || typeof bulk.eventId !== 'string') fail('Informe de 1 a 1000 lançamentos e o evento.')
    if (bulk.eventId && !references.events.some(event => event.id === bulk.eventId)) fail('Evento não encontrado.')
    const wanted = new Set(bulk.ids)
    let updated = 0
    for (const [index, previous] of entries.entries()) {
      if (!wanted.has(previous.id) || previous.eventId === bulk.eventId) { if (wanted.has(previous.id)) skipped++; continue }
      const next = { ...previous, eventId: bulk.eventId }
      const before = Object.fromEntries(fields.map(key => [key, previous[key]]))
      entries[index] = { ...next, updatedAt: at, history: [...previous.history, { action: 'updated', actor, at, before, after: Object.fromEntries(fields.map(key => [key, next[key]])) }] }
      updated++
    }
    const next = { revision: document.revision + (updated ? 1 : 0), entries }
    validateFinanceStore(next)
    return { document: next, response: { ...next, imported: 0, skipped, updated } }
  } else {
    if (!Array.isArray(payload.entries) || !payload.entries.length || payload.entries.length > 1000) fail('Envie entre 1 e 1000 lançamentos.')
    const batch = new Map()
    const existing = new Set(entries.map(entry => entry.externalId).filter(Boolean))
    for (const input of payload.entries) {
      const normalized = draft(input)
      const signature = JSON.stringify(normalized)
      if (normalized.externalId) {
        if (batch.has(normalized.externalId) && batch.get(normalized.externalId) !== signature) fail('Identificador externo repetido com dados conflitantes.')
        if (existing.has(normalized.externalId) || batch.has(normalized.externalId)) {
          batch.set(normalized.externalId, signature)
          skipped++
          continue
        }
        batch.set(normalized.externalId, signature)
      }
      const entry = linkedDraft(normalized, references)
      entries.push({ ...entry, id: `finance-${randomUUID()}`, createdAt: at, updatedAt: at, history: [{ action: 'created', actor, at }] })
      imported++
    }
  }
  const next = { revision: document.revision + (id !== undefined || imported ? 1 : 0), entries }
  validateFinanceStore(next)
  return { document: next, response: { ...next, imported, skipped } }
}
