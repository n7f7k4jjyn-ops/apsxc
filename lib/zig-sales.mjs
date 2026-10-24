import { addDays, ZigError, MAX_EVENTS_PER_QUERY } from './zig-client.mjs'
import { listZigEvents, validatePreviewPeriod } from './zig-preview.mjs'
import { EVENT_WINDOW } from './zig-matching.mjs'
import { mapZigEventToApp } from './zig-event-map.mjs'

// Tipos que representam receita de consumo/entrada. ZigCard (recarga) e Tip (gorjeta) não são receita da casa e ficam só no relatório.
const REVENUE_TYPES = { Normal: 'Bar e consumo', Couvert: 'Couvert', Entrance: 'Ingressos / portaria' }
const FINANCE_COUNTERPARTY = 'Zig · Verdant'
const OTHER_LABELS = { ZigCard: 'Recargas ZigCard', Tip: 'Gorjetas' }

const toInt = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0)

function lineValue(row) {
  return Math.max(0, toInt(row?.unitValue) * Math.max(0, toInt(row?.count)) - Math.max(0, toInt(row?.discountValue)))
}

// Agrupa as vendas por evento e tipo. Linhas estornadas vêm da consulta com refunded=true e só entram como informação.
export function summarizeSales(rows, refundedRows, allowedEventIds) {
  const events = new Map()
  const warnings = []
  let withoutEvent = 0
  let fractional = 0
  const slot = (row) => {
    const id = String(row?.eventId ?? '')
    if (!id) { withoutEvent += 1; return null }
    if (allowedEventIds && !allowedEventIds.has(id)) return null
    if (!events.has(id)) events.set(id, { eventId: id, eventName: String(row?.eventName ?? ''), eventDate: String(row?.eventDate ?? '').slice(0, 10), types: {}, otherTypes: {}, refundedCents: 0, refundedLines: 0 })
    return events.get(id)
  }
  for (const row of rows) {
    const target = slot(row)
    if (!target) continue
    if (row?.isRefunded === true) continue
    const type = String(row?.type ?? '')
    const bucketSet = REVENUE_TYPES[type] ? target.types : target.otherTypes
    const bucket = bucketSet[type] ||= { type, cents: 0, lines: 0, transactions: new Set(), categories: {} }
    const value = lineValue(row)
    if (row?.fractionalAmount !== null && row?.fractionalAmount !== undefined) fractional += 1
    bucket.cents += value
    bucket.lines += 1
    if (row?.transactionId) bucket.transactions.add(String(row.transactionId))
    const category = String(row?.productCategory || 'Sem categoria').slice(0, 80)
    bucket.categories[category] = (bucket.categories[category] || 0) + value
  }
  for (const row of refundedRows) {
    const target = slot(row)
    if (!target) continue
    target.refundedCents += lineValue(row)
    target.refundedLines += 1
  }
  if (withoutEvent) warnings.push(`${withoutEvent} linha(s) de venda sem evento foram ignoradas.`)
  if (fractional) warnings.push(`${fractional} linha(s) com quantidade fracionada: o valor foi calculado por valor unitário × quantidade; confira com a Zig.`)
  const list = [...events.values()].map((event) => ({
    ...event,
    types: Object.fromEntries(Object.entries(event.types).map(([key, value]) => [key, { ...value, transactions: value.transactions.size }])),
    otherTypes: Object.fromEntries(Object.entries(event.otherTypes).map(([key, value]) => [key, { ...value, transactions: value.transactions.size }])),
  })).sort((a, b) => a.eventDate.localeCompare(b.eventDate))
  return { events: list, warnings }
}

export function financeExternalId(lojaId, eventId, type) {
  return `zig:sales:${lojaId}:${eventId}:${type}`
}

function categoryNotes(bucket) {
  return Object.entries(bucket.categories).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([name, cents]) => `${name}: R$ ${(cents / 100).toFixed(2).replace('.', ',')}`).join('\n')
}

// Lançamentos: um por evento e tipo, como receita já recebida. Mesmo identificador externo = não duplica nem sobrescreve.
export function planSalesEntries(summary, { lojaId, existingEntries = [], appEvents = [] }) {
  const byExternal = new Map(existingEntries.filter((entry) => entry.externalId).map((entry) => [entry.externalId, entry]))
  const plan = { creates: [], unchanged: [], conflicts: [], notes: [] }
  for (const event of summary.events) {
    const { appEvent, reason } = mapZigEventToApp(event.beginMs, appEvents)
    const eventId = appEvent?.id ?? ''
    if (!eventId) plan.notes.push(`${event.eventName || event.eventId}: ${reason}; lançamentos ficam sem vínculo de evento.`)
    const money = (cents) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
    const outside = [
      ...Object.values(event.otherTypes).map((bucket) => `${OTHER_LABELS[bucket.type] ?? bucket.type}: ${money(bucket.cents)}`),
      ...(event.refundedCents ? [`Estornos: ${money(event.refundedCents)}`] : []),
    ]
    const outsideNote = outside.length ? `\nAnotado, fora da receita — ${outside.join('; ')}.` : ''
    for (const [type, label] of Object.entries(REVENUE_TYPES)) {
      const bucket = event.types[type]
      if (!bucket || bucket.cents <= 0) continue
      const externalId = financeExternalId(lojaId, event.eventId, type)
      const draft = {
        externalId, type: 'receivable', category: 'sales',
        description: `Zig · ${event.eventName || event.eventId} · ${label}`.slice(0, 500),
        counterparty: FINANCE_COUNTERPARTY, beneficiaryId: '', eventId,
        amountCents: bucket.cents, dueDate: event.eventDate, status: 'settled', settledDate: event.eventDate, paymentMethod: 'other',
        notes: `Importado da Zig (saida-produtos). ${bucket.transactions} transações, ${bucket.lines} itens.\n${categoryNotes(bucket)}${outsideNote}`,
      }
      const current = byExternal.get(externalId)
      if (!current) plan.creates.push(draft)
      else if (current.amountCents === draft.amountCents) plan.unchanged.push({ externalId, description: draft.description, amountCents: draft.amountCents })
      else plan.conflicts.push({ externalId, description: draft.description, existingCents: current.amountCents, zigCents: draft.amountCents })
    }
  }
  return plan
}

export async function collectZigSales({ client, lojaId, dtinicio, dtfim, now = Date.now() }) {
  const invalid = validatePreviewPeriod(dtinicio, dtfim)
  if (invalid) throw new ZigError(invalid, { code: 'invalid_period', status: 400 })
  const allEvents = await listZigEvents(client, lojaId, addDays(dtinicio, -1), addDays(dtfim, 2))
  const day = (event) => event.beginAt.slice(0, 10)
  const inPeriod = allEvents.filter((event) => day(event) >= dtinicio && day(event) <= dtfim)
  if (!inPeriod.length) throw new ZigError('A Zig não retornou eventos nesse período. Nada foi consultado.', { code: 'no_events', status: 422 })
  if (inPeriod.length > MAX_EVENTS_PER_QUERY) throw new ZigError(`O período contém ${inPeriod.length} eventos; a Zig aceita no máximo ${MAX_EVENTS_PER_QUERY}. Reduza o período.`, { code: 'too_many_events', status: 422 })
  const until = allEvents.filter((event) => day(event) >= dtinicio && day(event) <= addDays(dtfim, 1)).length <= MAX_EVENTS_PER_QUERY ? addDays(dtfim, 1) : dtfim
  const rows = await client.listSales(lojaId, dtinicio, until, false)
  const refundedRows = await client.listSales(lojaId, dtinicio, until, true)
  const beginById = new Map(inPeriod.map((event) => [event.id, event.beginMs ?? null]))
  const summary = summarizeSales(rows, refundedRows, new Set(inPeriod.map((event) => event.id)))
  summary.events = summary.events.map((event) => ({ ...event, beginMs: beginById.get(event.eventId) ?? null }))
  const warnings = [...summary.warnings]
  const lastBegin = Math.max(...inPeriod.map((event) => event.beginMs ?? 0))
  if (now < lastBegin + EVENT_WINDOW.maxDurationHours * 3_600_000) warnings.push('O último evento pode ainda estar em andamento; os valores podem estar incompletos. Use um evento encerrado.')
  const missing = inPeriod.filter((event) => !summary.events.some((item) => item.eventId === event.id))
  if (missing.length) warnings.push(`Sem vendas retornadas para: ${missing.map((event) => event.name || event.id).join(', ')}.`)
  return { lojaId, period: { dtinicio, dtfim, until }, events: summary.events, warnings, rowCounts: { sales: rows.length, refunded: refundedRows.length } }
}

export function formatSalesPreview(data, plan) {
  return {
    complete: true,
    period: data.period,
    warnings: [...data.warnings, ...plan.notes],
    rowCounts: data.rowCounts,
    events: data.events.map((event) => ({
      eventId: event.eventId, eventName: event.eventName, eventDate: event.eventDate,
      revenue: Object.entries(REVENUE_TYPES).map(([type, label]) => ({ type, label, cents: event.types[type]?.cents ?? 0, transactions: event.types[type]?.transactions ?? 0 })),
      totalCents: Object.values(event.types).reduce((sum, bucket) => sum + bucket.cents, 0),
      excluded: Object.values(event.otherTypes).map((bucket) => ({ type: bucket.type, cents: bucket.cents })),
      refundedCents: event.refundedCents,
    })),
    plan: { creates: plan.creates.length, unchanged: plan.unchanged.length, conflicts: plan.conflicts },
  }
}
