import { parseExcelDate, readWorkbookSheets } from './customer-import'
import type { FormKey, Registration, VerdantEvent } from './data'

const sourceSystem = 'verdant-lista-unica'
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

function columnIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(normalize(header)))
}

function field(row: string[], index: number) {
  return index < 0 ? '' : String(row[index] ?? '').trim()
}

function formKeyFor(category: string): FormKey | null {
  const value = normalize(category)
  if (value.includes('dj')) return 'DJS'
  if (value.includes('influencer')) return 'INFLUENCIADORES'
  if (value.includes('lover')) return 'LISTA_LOVERS'
  if (value.includes('anivers')) return 'ANIVERSARIO'
  if (value.includes('vip')) return 'VIP'
  return null
}

function localTimestamp(value: string) {
  const parsed = parseExcelDate(value)
  if (!parsed) return ''
  const local = parsed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/)
  return local ? `${local[1]}:00-03:00` : ''
}

function consentValue(value: string) {
  const normalized = normalize(value)
  if (['sim', 'yes', 'true', '1', 'aceito', 'aceita'].includes(normalized))
    return { consent: true, answered: true }
  if (
    ['nao', 'no', 'false', '0', 'naoaceito', 'naoaceita'].includes(normalized)
  )
    return { consent: false, answered: true }
  return { consent: false, answered: false }
}

function eventDays(value: string) {
  const normalized = normalize(value)
  return (
    [
      ['sexta', 'Sexta-feira'],
      ['sabado', 'Sábado'],
      ['domingo', 'Domingo'],
    ] as const
  )
    .filter(([token]) => normalized.includes(token))
    .map(([, label]) => label)
}

function resolveEvent(
  eventLabel: string,
  schedules: Map<string, { date: string; name: string }[]>,
  events: VerdantEvent[]
) {
  const days = eventDays(eventLabel)
  if (days.length !== 1) {
    return {
      eventDate: '',
      eventId: '',
      eventName: eventLabel,
      matched: false,
      ambiguous: days.length > 1,
    }
  }
  const daySchedules = schedules.get(normalize(days[0])) ?? []
  if (daySchedules.length !== 1 || !daySchedules[0].date) {
    return {
      eventDate: '',
      eventId: '',
      eventName: eventLabel,
      matched: false,
      ambiguous: daySchedules.length > 1,
    }
  }
  const sourceSchedule = daySchedules[0]
  const matches = events.filter((event) => event.date === sourceSchedule.date)
  if (matches.length !== 1) {
    return {
      eventDate: sourceSchedule.date,
      eventId: '',
      eventName: sourceSchedule.name || eventLabel,
      matched: false,
      ambiguous: matches.length > 1,
    }
  }
  return {
    eventDate: sourceSchedule.date,
    eventId: matches[0].id,
    eventName: sourceSchedule.name || matches[0].name,
    matched: true,
    ambiguous: false,
  }
}

function parseEventSchedules(rows: string[][]) {
  const headers = rows[0] ?? []
  const dayColumn = columnIndex(headers, ['diadoevento'])
  const dateColumn = columnIndex(headers, ['datadoevento'])
  const nameColumn = columnIndex(headers, [
    'nomedoeventoopcional',
    'nomedoevento',
  ])
  const schedules = new Map<string, { date: string; name: string }[]>()
  for (const row of rows.slice(1)) {
    const day = field(row, dayColumn)
    if (!day) continue
    const key = normalize(day)
    const date = parseExcelDate(field(row, dateColumn)).slice(0, 10)
    const name = field(row, nameColumn)
    schedules.set(key, [...(schedules.get(key) ?? []), { date, name }])
  }
  return schedules
}

function sameSourceRow(left: Registration, right: Registration) {
  return [
    'formKey',
    'eventId',
    'eventName',
    'eventDate',
    'name',
    'whatsapp',
    'email',
    'consent',
    'consentAnswered',
    'sourceDetails',
    'createdAt',
  ].every(
    (key) =>
      left[key as keyof Registration] === right[key as keyof Registration]
  )
}

export type HistoricalRegistrationImport = {
  registrations: Registration[]
  sourceRows: number
  readyRows: number
  alreadyImported: number
  unlinkedCustomerRegistrations: number
  skippedInvalid: number
  unsupportedCategory: number
  duplicateRows: number
  conflictingSourceIds: number
  matchedEvents: number
  unmatchedEvents: number
  ambiguousEvents: number
}

export async function readHistoricalRegistrationImport(
  file: File,
  events: VerdantEvent[],
  existing: Registration[]
): Promise<HistoricalRegistrationImport> {
  const sheets = await readWorkbookSheets(file)
  const mainRows = sheets['Lista Única']
  const scheduleRows = sheets['Agenda de Eventos']
  if (!mainRows || !scheduleRows)
    throw new Error(
      'O Excel precisa conter as abas “Lista Única” e “Agenda de Eventos”.'
    )

  const headers = mainRows[0] ?? []
  const columns = {
    timestamp: columnIndex(headers, [
      'carimbodedatahora',
      'datahora',
      'datadocadastro',
    ]),
    event: columnIndex(headers, ['evento']),
    category: columnIndex(headers, ['categoria', 'formulariodeorigem']),
    name: columnIndex(headers, ['nomecompleto', 'nome']),
    phone: columnIndex(headers, ['telefonewhatsapp', 'telefone', 'whatsapp']),
    email: columnIndex(headers, ['email']),
    consent: columnIndex(headers, ['aceitedenovidades', 'consentimento']),
    details: columnIndex(headers, ['detalhesespecificos']),
    sourceId: columnIndex(headers, ['iddaresposta', 'idinternodaresposta']),
  }
  const missingColumns = Object.entries(columns)
    .filter(([, index]) => index < 0)
    .map(([name]) => name)
  if (missingColumns.length)
    throw new Error(
      'A aba “Lista Única” não contém as colunas necessárias para importar as inscrições.'
    )

  const schedules = parseEventSchedules(scheduleRows)
  let skippedInvalid = 0
  let unsupportedCategory = 0
  let sourceRows = 0
  const bySourceId = new Map<string, Registration[]>()
  const ambiguousSourceIds = new Set<string>()
  for (const row of mainRows.slice(1)) {
    if (!row.some((cell) => String(cell ?? '').trim())) continue
    sourceRows++
    const sourceId = field(row, columns.sourceId)
    const name = field(row, columns.name)
    const createdAt = localTimestamp(field(row, columns.timestamp))
    const formKey = formKeyFor(field(row, columns.category))
    if (!formKey) {
      unsupportedCategory++
      continue
    }
    if (!sourceId || sourceId.length > 100 || !name || !createdAt) {
      skippedInvalid++
      continue
    }
    const event = resolveEvent(field(row, columns.event), schedules, events)
    if (event.ambiguous) ambiguousSourceIds.add(sourceId)
    const consentText = field(row, columns.consent)
    const consent = consentValue(consentText)
    const registration: Registration = {
      id: `import-lista-unica-${sourceId}`,
      sourceSystem,
      sourceId,
      sourceDetails: field(row, columns.details),
      formKey,
      eventId: event.eventId,
      eventName: event.eventName,
      eventDate: event.eventDate,
      name,
      whatsapp: field(row, columns.phone),
      email: field(row, columns.email).toLowerCase(),
      consent: consent.consent,
      consentAnswered: consent.answered,
      optionId: '',
      optionName: '',
      profileType: '',
      birthdayDate: '',
      guestNames: [],
      createdAt,
      status: 'historical-import',
    }
    bySourceId.set(sourceId, [
      ...(bySourceId.get(sourceId) ?? []),
      registration,
    ])
  }

  let duplicateRows = 0
  let conflictingSourceIds = 0
  const importedKeys = new Set(
    existing
      .filter(
        (registration) =>
          registration.sourceSystem === sourceSystem && registration.sourceId
      )
      .map((registration) => registration.sourceId as string)
  )
  const importedIds = new Set(existing.map((registration) => registration.id))
  let alreadyImported = 0
  let matchedEvents = 0
  let unmatchedEvents = 0
  let ambiguousEvents = 0
  const registrations: Registration[] = []
  for (const [sourceId, rows] of bySourceId) {
    const first = rows[0]
    if (rows.some((row) => !sameSourceRow(first, row))) {
      conflictingSourceIds++
      continue
    }
    duplicateRows += rows.length - 1
    if (importedKeys.has(sourceId) || importedIds.has(first.id)) {
      alreadyImported++
      continue
    }
    if (first.eventId) matchedEvents++
    else {
      unmatchedEvents++
      if (ambiguousSourceIds.has(sourceId)) ambiguousEvents++
    }
    registrations.push(first)
  }
  return {
    registrations,
    sourceRows,
    readyRows: registrations.length,
    alreadyImported,
    unlinkedCustomerRegistrations: bySourceId.size - conflictingSourceIds,
    skippedInvalid,
    unsupportedCategory,
    duplicateRows,
    conflictingSourceIds,
    matchedEvents,
    unmatchedEvents,
    ambiguousEvents,
  }
}
