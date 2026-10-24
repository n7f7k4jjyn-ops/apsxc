import type { VerdantState } from './data'
import type { PortariaSection } from './portaria-pdf'

export type DjLineRow = {
  id: string
  name: string
  track: string
  time: string
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
    .map((p) => ({
      id: p.id,
      name: p.name,
      track: p.eventDetails[eventId]?.track || '',
      time: p.eventDetails[eventId]?.time || '',
      order: p.eventDetails[eventId]?.order || 0,
    }))
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
            `${row.order || 'Sem ordem'}. ${row.name} | ${row.time || 'Horário não informado'}`
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
