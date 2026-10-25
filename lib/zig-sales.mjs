import { createHash } from 'node:crypto'
import { summarizeBilling, billingMethod } from './zig-billing.mjs'
import { addDays, ZigError, MAX_EVENTS_PER_QUERY } from './zig-client.mjs'
import { listZigEvents, validatePreviewPeriod, zigEventDay } from './zig-preview.mjs'
import { EVENT_WINDOW } from './zig-matching.mjs'
import { mapZigEventToApp } from './zig-event-map.mjs'

// Tipos que representam receita de consumo/entrada. ZigCard (recarga) e Tip (gorjeta) não são receita da casa e ficam só no relatório.
const REVENUE_TYPES = { Normal: 'Bar e consumo', Couvert: 'Couvert', Entrance: 'Ingressos / portaria' }
const FINANCE_COUNTERPARTY = 'Zig · Faturamento'
const OTHER_LABELS = { ZigCard: 'Recargas ZigCard', Tip: 'Gorjetas' }

const toMoney = (value) => {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string' && !value.trim()) throw new ZigError('Valor monetário ausente retornado pela Zig. Consulta bloqueada.', { code: 'invalid_sale_amount', status: 422 })
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new ZigError('Valor monetário inválido retornado pela Zig. Importação bloqueada.', { code: 'invalid_sale_amount', status: 422 })
  return number
}

function lineValue(row) {
  const quantity = toMoney(row?.count)
  // API Zig: unitValue/discountValue em centavos; refunded=false já exclui cancelamentos.
  const unit = toMoney(row?.unitValue), discount = toMoney(row?.discountValue)
  if (!Number.isSafeInteger(unit) || !Number.isSafeInteger(discount)) throw new ZigError('Valores em centavos devem ser inteiros.', { code: 'invalid_sale_amount', status: 422 })
  const value = Math.round(unit * quantity - discount)
  if (!Number.isSafeInteger(value) || value < 0) throw new ZigError('Total de produto inválido retornado pela Zig.', { code: 'invalid_sale_amount', status: 422 })
  return value
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

// Lançamentos: um por evento e tipo, pelos pagamentos do faturamento. Mesmo identificador externo = não duplica nem sobrescreve.
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
    const legacy = existingEntries.filter(entry => entry.externalId?.startsWith(`zig:sales:${lojaId}:${event.eventId}:`) && entry.status !== 'cancelled')
    if (legacy.length) {
      plan.conflicts.push({ externalId: `zig:billing:${lojaId}:${event.eventId}`, description: `Revise os lançamentos antigos por consumo de ${event.eventName || event.eventId} antes de importar faturamento.`, existingCents: legacy.reduce((sum, entry) => sum + entry.amountCents, 0), zigCents: (event.billing || []).reduce((sum, payment) => sum + payment.cents, 0) })
      continue
    }
    if (!event.billingAvailable) { plan.notes.push(`${event.eventName || event.eventId}: faturamento não retornado; nenhuma receita será criada.`); continue }
    for (const payment of event.billing) {
      if (payment.cents <= 0) continue
      const externalId = `zig:billing:${lojaId}:${event.eventId}:${payment.paymentId}`
      const draft = {
        externalId, type: 'receivable', category: 'sales',
        description: `Zig · ${event.eventName || event.eventId} · ${payment.paymentName}`.slice(0, 500),
        counterparty: FINANCE_COUNTERPARTY, beneficiaryId: '', eventId,
        amountCents: payment.cents, dueDate: event.eventDate, status: 'settled', settledDate: event.eventDate, paymentMethod: billingMethod(payment.paymentName),
        notes: `Origem: /erp/faturamento. Pagamentos do evento; não representa repasse bancário líquido nem adquirência adicional. Saída de produtos é consumo e não foi somada.${outsideNote}`,
      }
      const current = byExternal.get(externalId)
      if (!current) plan.creates.push(draft)
      else if (current.amountCents === draft.amountCents && current.eventId === draft.eventId && current.status === draft.status) plan.unchanged.push({ externalId, description: draft.description, amountCents: draft.amountCents })
      else plan.conflicts.push({ externalId, description: draft.description, existingCents: current.amountCents, zigCents: draft.amountCents })
    }
  }
  return plan
}

export async function collectZigSales({ client, lojaId, redeId, dtinicio, dtfim, now = Date.now() }) {
  const invalid = validatePreviewPeriod(dtinicio, dtfim)
  if (invalid) throw new ZigError(invalid, { code: 'invalid_period', status: 400 })
  const allEvents = await listZigEvents(client, lojaId, addDays(dtinicio, -1), addDays(dtfim, 2))
  const day = (event) => zigEventDay(event.beginAt)
  const inPeriod = allEvents.filter((event) => day(event) >= dtinicio && day(event) <= dtfim)
  if (!inPeriod.length) throw new ZigError('A Zig não retornou eventos nesse período. Nada foi consultado.', { code: 'no_events', status: 422 })
  if (inPeriod.length > MAX_EVENTS_PER_QUERY) throw new ZigError(`O período contém ${inPeriod.length} eventos; a Zig aceita no máximo ${MAX_EVENTS_PER_QUERY}. Reduza o período.`, { code: 'too_many_events', status: 422 })
  const until = allEvents.filter((event) => day(event) >= dtinicio && day(event) <= addDays(dtfim, 1)).length <= MAX_EVENTS_PER_QUERY ? addDays(dtfim, 1) : dtfim
  const rows = await client.listSales(lojaId, dtinicio, until, false)
  const refundedRows = await client.listSales(lojaId, dtinicio, until, true)
  const billingRows = await client.listBilling(lojaId, dtinicio, until)
  const billing = summarizeBilling(billingRows, { lojaId, redeId, allowedEventIds: new Set(inPeriod.map(event => event.id)) })
  const beginById = new Map(inPeriod.map((event) => [event.id, event.beginMs ?? null]))
  const summary = summarizeSales(rows, refundedRows, new Set(inPeriod.map((event) => event.id)))
  summary.events = inPeriod.map(source => {
    const event = summary.events.find(item => item.eventId === source.id) || { eventId: source.id, eventName: source.name, types: {}, otherTypes: {}, refundedCents: 0, refundedLines: 0 }
    return { ...event, eventName: source.name || event.eventName, eventDate: day(source), beginMs: beginById.get(source.id) ?? null, billing: billing.get(source.id) || [], billingAvailable: billing.has(source.id) }
  })
  const warnings = [...summary.warnings]
  const lastBegin = Math.max(...inPeriod.map((event) => event.beginMs ?? 0))
  if (now < lastBegin + EVENT_WINDOW.maxDurationHours * 3_600_000) warnings.push('O último evento pode ainda estar em andamento; os valores podem estar incompletos. Use um evento encerrado.')
  const missing = inPeriod.filter((event) => !billing.has(event.id))
  if (missing.length) warnings.push(`Sem faturamento retornado para: ${missing.map((event) => event.name || event.id).join(', ')}.`)
  return { lojaId, period: { dtinicio, dtfim, until }, events: summary.events, warnings, rowCounts: { sales: rows.length, refunded: refundedRows.length, billing: billingRows.length } }
}

export function salesFingerprint(data, plan) {
  return createHash('sha256').update(JSON.stringify({ lojaId: data.lojaId, period: data.period, events: data.events, plan })).digest('hex')
}

export function formatSalesPreview(data, plan) {
  return {
    complete: true,
    fingerprint: salesFingerprint(data, plan),
    revenueSource: '/erp/faturamento',
    period: data.period,
    warnings: [...data.warnings, ...plan.notes],
    rowCounts: data.rowCounts,
    events: data.events.map((event) => ({
      eventId: event.eventId, eventName: event.eventName, eventDate: event.eventDate,
      revenue: Object.entries(REVENUE_TYPES).map(([type, label]) => ({ type, label, cents: event.types[type]?.cents ?? 0, transactions: event.types[type]?.transactions ?? 0 })),
      totalCents: (event.billing || []).reduce((sum, payment) => sum + payment.cents, 0),
      billingAvailable: event.billingAvailable,
      billing: event.billing || [],
      consumptionCents: Object.values(event.types).reduce((sum, bucket) => sum + bucket.cents, 0),
      excluded: Object.values(event.otherTypes).map((bucket) => ({ type: bucket.type, cents: bucket.cents })),
      refundedCents: event.refundedCents,
    })),
    plan: { creates: plan.creates.length, unchanged: plan.unchanged.length, conflicts: plan.conflicts },
  }
}
