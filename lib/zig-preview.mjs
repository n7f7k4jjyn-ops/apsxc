import { addDays, parseDay, MAX_EVENTS_PER_QUERY, CHECKIN_MAX_WINDOW_DAYS, ZigError } from './zig-client.mjs'
import { buildExistingEntities, buildZigPeople, EVENT_WINDOW, matchPeople, parseInstant, splitByPresence, summarize } from './zig-matching.mjs'
import { planZigWrites } from './zig-apply.mjs'

export function zigEventDay(value) {
  const time = parseInstant(value)
  return time === null ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(time))
}

export const MAX_PREVIEW_DAYS = 14
const GROUP_LIMIT = 500

export function validatePreviewPeriod(dtinicio, dtfim) {
  const from = parseDay(dtinicio)
  const to = parseDay(dtfim)
  if (from === null || to === null) return 'Informe datas válidas no formato AAAA-MM-DD.'
  if (to < from) return 'A data final não pode ser anterior à inicial.'
  if ((to - from) / 86_400_000 > MAX_PREVIEW_DAYS - 1) return `O período da prévia pode ter no máximo ${MAX_PREVIEW_DAYS} dias.`
  return ''
}

// Janelas de no máximo 5 dias que se sobrepõem em 1 dia, para não perder check-ins na borda; a repetição é removida depois.
export function checkinWindows(start, end) {
  const windows = []
  let cursor = start
  for (;;) {
    const limit = addDays(cursor, CHECKIN_MAX_WINDOW_DAYS)
    const windowEnd = limit < end ? limit : end
    windows.push({ desde: cursor, dtfim: windowEnd })
    if (windowEnd >= end) return windows
    cursor = windowEnd
  }
}

function normalizeEvents(rows) {
  return rows.map((row) => ({
    id: String(row?.id ?? ''),
    name: String(row?.name ?? ''),
    beginAt: String(row?.beginAt ?? ''),
    beginMs: parseInstant(row?.beginAt),
    peopleCapacity: row?.peopleCapacity ?? null,
  })).filter((event) => event.id)
}

function limited(list) {
  return list.length > GROUP_LIMIT ? { items: list.slice(0, GROUP_LIMIT), total: list.length, truncated: true } : { items: list, total: list.length, truncated: false }
}

export async function listZigEvents(client, lojaId, dtinicio, dtfim) {
  return normalizeEvents(await client.listEvents(lojaId, dtinicio, dtfim)).sort((a, b) => (a.beginMs ?? 0) - (b.beginMs ?? 0))
}

export async function collectZigData({ client, lojaId, dtinicio, dtfim, now = Date.now() }) {
  const invalid = validatePreviewPeriod(dtinicio, dtfim)
  if (invalid) throw new ZigError(invalid, { code: 'invalid_period', status: 400 })

  // Eventos vizinhos (noite anterior e dias seguintes) entram só como contexto para não misturar pessoas de outro evento.
  const allEvents = await listZigEvents(client, lojaId, addDays(dtinicio, -1), addDays(dtfim, 2))
  const eventDay = (event) => zigEventDay(event.beginAt)
  const inPeriod = allEvents.filter((event) => eventDay(event) >= dtinicio && eventDay(event) <= dtfim)
  const events = allEvents.map((event) => ({ ...event, inRequestedPeriod: inPeriod.includes(event) }))
  const requestedIds = new Set(inPeriod.map((event) => event.id))
  if (!inPeriod.length) throw new ZigError('A Zig não retornou eventos nesse período. Nada foi consultado.', { code: 'no_events', status: 422 })
  if (inPeriod.length > MAX_EVENTS_PER_QUERY) {
    throw new ZigError(`O período contém ${inPeriod.length} eventos; a Zig aceita no máximo ${MAX_EVENTS_PER_QUERY} por consulta de compradores. Reduza o período.`, { code: 'too_many_events', status: 422 })
  }

  const rawCheckins = []
  let pages = 0
  for (const window of checkinWindows(dtinicio, addDays(dtfim, 2))) {
    const { items, pages: used } = await client.listCheckins(lojaId, window.desde, window.dtfim)
    rawCheckins.push(...items)
    pages += used
  }
  const seen = new Set()
  const checkins = rawCheckins.filter((row) => {
    const key = `${row?.id}|${row?.checkinTime}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  // Compradores também cobrem a madrugada do dia seguinte, desde que o limite de 5 eventos da Zig seja respeitado.
  const buyersUntil = addDays(dtfim, 1)
  const extendBuyers = allEvents.filter((event) => eventDay(event) >= dtinicio && eventDay(event) <= buyersUntil).length <= MAX_EVENTS_PER_QUERY
  const buyers = await client.listBuyers(lojaId, dtinicio, extendBuyers ? buyersUntil : dtfim)

  const allPeople = buildZigPeople(checkins, buyers, events, requestedIds)
  const { confirmed: zigPeople, unconfirmed, otherEventOnly } = splitByPresence(allPeople)

  const lastBegin = Math.max(...inPeriod.map((event) => event.beginMs ?? 0))
  const warnings = []
  if (now < lastBegin + EVENT_WINDOW.maxDurationHours * 3_600_000) warnings.push('O último evento pode ainda estar em andamento; os dados podem estar incompletos. Use um evento encerrado.')
  if (!extendBuyers) warnings.push('Há outro evento no dia seguinte ao período; os compradores foram consultados só até a data final e compras da madrugada podem não aparecer. Reduza o período para conferir.')
  const outside = unconfirmed.filter((item) => item.reason === 'outside_window').length
  const ambiguous = unconfirmed.filter((item) => item.reason === 'ambiguous_events').length
  if (outside) warnings.push(`${outside} pessoa(s) só têm registros fora da janela de qualquer evento; ficaram em Presença não confirmada.`)
  if (ambiguous) warnings.push(`${ambiguous} pessoa(s) só têm registros compatíveis com mais de um evento; ficaram em Presença não confirmada.`)

  return {
    now, lojaId, zigPeople, unconfirmed, events, warnings,
    period: { dtinicio, dtfim, checkinsUntil: addDays(dtfim, 2), buyersUntil: extendBuyers ? buyersUntil : dtfim },
    totals: { checkinsRaw: rawCheckins.length, checkins: checkins.length, checkinPages: pages, buyers: buyers.length, zigPeople: zigPeople.length, unconfirmed: unconfirmed.length, otherEventOnly },
  }
}

export function matchZigData(data, customers, registrations) {
  return matchPeople(data.zigPeople, buildExistingEntities(customers, registrations), { lojaId: data.lojaId })
}

export async function buildZigPreview({ client, lojaId, dtinicio, dtfim, customers, registrations, now = Date.now() }) {
  const data = await collectZigData({ client, lojaId, dtinicio, dtfim, now })
  const groups = matchZigData(data, customers, registrations)
  return formatZigPreview(data, groups, customers)
}

export function formatZigPreview(data, groups, customers) {
  const { unconfirmed, events, warnings, period, totals } = data
  const plan = planZigWrites(groups, customers, { lojaId: data.lojaId, now: new Date(data.now).toISOString() })
  return {
    complete: true,
    generatedAt: new Date(data.now).toISOString(),
    period,
    assumptions: [
      `Check-ins não trazem eventId. Associação PROVISÓRIA por horário: de ${EVENT_WINDOW.earlyHours}h antes até ${EVENT_WINDOW.maxDurationHours}h depois do início do evento (premissa a confirmar com um evento encerrado).`,
      'Só registros associados a um único evento do período contam como presença; registros fora da janela, compatíveis com mais de um evento ou de eventos vizinhos não entram nos grupos de cruzamento.',
      'O campo id do check-in é o userId da Zig, não uma garantia de presença única.',
      'A prévia não grava nenhum dado; a gravação é uma ação separada e confirmada. Documentos são exibidos mascarados.',
    ],
    warnings,
    events: events.map((event) => ({ id: event.id, name: event.name, beginAt: event.beginAt, inRequestedPeriod: event.inRequestedPeriod })),
    totals,
    summary: summarize(groups),
    plan: plan.summary,
    groups: { linked: limited(groups.linked), created: limited(groups.created), divergent: limited(groups.divergent), tables: limited(groups.tables), unconfirmed: limited(unconfirmed) },
  }
}

