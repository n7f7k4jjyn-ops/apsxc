import { addDays, formatDay, parseDay, MAX_EVENTS_PER_QUERY, CHECKIN_MAX_WINDOW_DAYS, ZigError } from './zig-client.mjs'
import { buildExistingEntities, buildZigPeople, EVENT_WINDOW, matchPeople, parseInstant, summarize } from './zig-matching.mjs'

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

export async function buildZigPreview({ client, lojaId, dtinicio, dtfim, customers, registrations, now = Date.now() }) {
  const invalid = validatePreviewPeriod(dtinicio, dtfim)
  if (invalid) throw new ZigError(invalid, { code: 'invalid_period', status: 400 })

  const allEvents = await listZigEvents(client, lojaId, addDays(dtinicio, -1), dtfim)
  const inPeriod = allEvents.filter((event) => event.beginAt.slice(0, 10) >= dtinicio && event.beginAt.slice(0, 10) <= dtfim)
  const events = allEvents.map((event) => ({ ...event, inRequestedPeriod: inPeriod.includes(event) }))
  if (!inPeriod.length) throw new ZigError('A Zig não retornou eventos nesse período. Nada foi consultado.', { code: 'no_events', status: 422 })
  if (inPeriod.length > MAX_EVENTS_PER_QUERY) {
    throw new ZigError(`O período contém ${inPeriod.length} eventos; a Zig aceita no máximo ${MAX_EVENTS_PER_QUERY} por consulta de compradores. Reduza o período.`, { code: 'too_many_events', status: 422 })
  }

  const rawCheckins = []
  let pages = 0
  for (const window of checkinWindows(dtinicio, addDays(dtfim, 1))) {
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
  const buyers = await client.listBuyers(lojaId, dtinicio, dtfim)

  const zigPeople = buildZigPeople(checkins, buyers, events)
  const groups = matchPeople(zigPeople, buildExistingEntities(customers, registrations), { lojaId })

  const lastBegin = Math.max(...inPeriod.map((event) => event.beginMs ?? 0))
  const warnings = []
  if (now < lastBegin + EVENT_WINDOW.maxDurationHours * 3_600_000) warnings.push('O último evento pode ainda estar em andamento; os dados podem estar incompletos. Use um evento encerrado.')
  const unassigned = zigPeople.reduce((total, person) => total + person.unassigned, 0)
  const ambiguous = zigPeople.reduce((total, person) => total + person.ambiguousEvents, 0)
  if (unassigned) warnings.push(`${unassigned} check-in(s) ficaram fora da janela de qualquer evento consultado e não foram associados.`)
  if (ambiguous) warnings.push(`${ambiguous} check-in(s) cabem em mais de um evento e ficaram sem associação.`)

  return {
    complete: true,
    generatedAt: new Date(now).toISOString(),
    period: { dtinicio, dtfim, checkinsUntil: formatDay(parseDay(dtfim) + 86_400_000) },
    assumptions: [
      `Check-ins não trazem eventId. Associação por horário: de ${EVENT_WINDOW.earlyHours}h antes até ${EVENT_WINDOW.maxDurationHours}h depois do início do evento (premissa a confirmar com um evento encerrado).`,
      'O campo id do check-in é o userId da Zig, não uma garantia de presença única.',
      'Documentos são exibidos mascarados e a prévia não grava nenhum dado.',
    ],
    warnings,
    events: events.map((event) => ({ id: event.id, name: event.name, beginAt: event.beginAt, inRequestedPeriod: event.inRequestedPeriod })),
    totals: { checkinsRaw: rawCheckins.length, checkins: checkins.length, checkinPages: pages, buyers: buyers.length, zigPeople: zigPeople.length },
    summary: summarize(groups),
    groups: { linked: limited(groups.linked), created: limited(groups.created), divergent: limited(groups.divergent), tables: limited(groups.tables) },
  }
}
