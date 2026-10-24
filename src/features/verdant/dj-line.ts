import type { VerdantState } from './data'
import type { PortariaSection } from './portaria-pdf'

export type DjLineRow = {
  id: string
  slotKey?: string
  name: string
  track: string
  time: string
  secondTime?: string
  order: number
}
export function djLineRows(
  data: VerdantState,
  eventId: string,
  sort: 'order' | 'time' = 'order'
): DjLineRow[] {
  const start = data.events.find((e) => e.id === eventId)?.eventTime || '18:00'
  const minutes = (time: string) => {
    const m = time.match(/^(\d{1,2}):(\d{2})/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
  }
  const beginning = minutes(start)
  const night = (time: string) => {
    const n = minutes(time)
    return Number.isNaN(n) ? Infinity : n + (n < beginning ? 1440 : 0)
  }
  return data.people
    .filter((p) => p.kind === 'DJ' && p.eventIds.includes(eventId))
    .flatMap((p) => {
      const detail = p.eventDetails[eventId] || {
        track: '',
        time: '',
        order: 0,
      }
      return [detail, ...(detail.additionalSets || [])].map((set, index) => ({
        id: p.id,
        slotKey: `${p.id}:${index}`,
        name: p.name,
        track: set.track || '',
        time: set.time || '',
        secondTime: set.secondTime || '',
        order: set.order || 0,
      }))
    })
    .sort(
      (a, b) =>
        a.track.localeCompare(b.track, 'pt-BR') ||
        (sort === 'time'
          ? night(a.time) - night(b.time)
          : (a.order || Infinity) - (b.order || Infinity)) ||
        a.name.localeCompare(b.name, 'pt-BR')
    )
}

export function djLineSections(rows: DjLineRow[]): PortariaSection[] {
  const tracks = new Map<string, DjLineRow[]>()
  for (const row of rows) {
    const track = row.track || 'Pista não informada'
    tracks.set(track, [...(tracks.get(track) || []), row])
  }
  return [...tracks].map(([track, items]) => ({
    title: `Line de DJs — ${track}`,
    groups: [
      {
        label: 'Ordem | DJ | Horário',
        names: items.map(
          (row) =>
            `${row.order || 'Sem ordem'}. ${row.name} | ${row.time || 'Horário não informado'}${row.secondTime ? ` / 2º: ${row.secondTime}` : ''}`
        ),
      },
    ],
  }))
}

export function djGuests(data: VerdantState, eventId: string) {
  return data.registrations
    .filter((r) => r.eventId === eventId && r.formKey === 'DJS')
    .map((r) => ({
      ...r,
      professional:
        data.people.find((p) => p.id === r.optionId && p.kind === 'DJ')?.name ||
        r.optionName ||
        'DJ não informado',
    }))
}

export function validateDjOrder(rows: DjLineRow[]) {
  const used = new Set<string>()
  for (const row of rows) {
    if (!Number.isSafeInteger(row.order) || row.order < 1)
      throw new Error(
        `Informe uma ordem inteira a partir de 1 para ${row.name}.`
      )
    const key = `${row.track.trim().toLocaleLowerCase()}|${row.order}`
    if (used.has(key))
      throw new Error(
        `Ordem ${row.order} repetida na pista ${row.track || 'não informada'}.`
      )
    used.add(key)
  }
}

// Replacement changes only the current event schedule. Historical registrations and finance retain their beneficiary IDs.
export function applyDjLine(
  state: VerdantState,
  eventId: string,
  rows: (DjLineRow & { originalId: string; originalPersonId?: string })[]
): VerdantState {
  validateDjOrder(rows)
  if (
    new Set(rows.map((row) => `${row.id}|${row.track.trim().toUpperCase()}`))
      .size !== rows.length
  )
    throw new Error(
      'O mesmo DJ não pode ocupar duas posições na mesma pista. Use o segundo horário.'
    )
  for (const row of rows) {
    if (
      !state.people.some(
        (person) => person.id === row.id && person.kind === 'DJ'
      )
    )
      throw new Error('DJ não encontrado.')
    if (!['SKY', 'LAND'].includes(row.track))
      throw new Error('Escolha SKY ou LAND para cada DJ.')
    if (row.secondTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.secondTime))
      throw new Error('Informe um segundo horário válido.')
  }
  const originals = new Set(
    rows.map((row) => row.originalPersonId || row.originalId)
  )
  return {
    ...state,
    people: state.people.map((person) => {
      const slots = rows.filter((item) => item.id === person.id)
      const row = slots[0]
      if (row)
        return {
          ...person,
          eventIds: [...new Set([...person.eventIds, eventId])],
          eventDetails: {
            ...person.eventDetails,
            [eventId]: {
              track: row.track,
              time: row.time,
              secondTime: row.secondTime || '',
              order: row.order,
              additionalSets: slots
                .slice(1)
                .map((set) => ({
                  track: set.track,
                  time: set.time,
                  secondTime: set.secondTime || '',
                  order: set.order,
                })),
            },
          },
        }
      if (!originals.has(person.id)) return person
      const details = { ...person.eventDetails }
      delete details[eventId]
      return {
        ...person,
        eventIds: person.eventIds.filter((id) => id !== eventId),
        eventDetails: details,
      }
    }),
  }
}
