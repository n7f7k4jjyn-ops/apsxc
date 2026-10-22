export type RosterMember = {
  id: string
  name: string
  roles: string[]
  availability: string[]
  status: 'pending' | 'active' | 'inactive'
}
export type RosterEntry = {
  memberId: string
  name: string
  role: string
  posts: string[]
  availability: string[]
  entry: string
  exit: string
  exitDate?: string
}
export type Roster = {
  id?: string
  version?: number
  date: string
  eventId: string
  eventName: string
  kind: 'security' | 'staff'
  status: 'draft' | 'finalized'
  template: number
  entries: RosterEntry[]
  updatedAt?: string
}
export const posts = [
  'Saída principal',
  'Revista',
  'Apoio',
  'LAND - Pista',
  'SKY - Pista',
  'SKY - Escada',
  'Bombeiro - Entrada',
  'Bombeiro - Saída',
  'Saída de emergência',
  'Terraço',
  'VIP',
  'Mezanino',
  'Ronda',
]
export const roles = [
  'Caixa',
  'Caixa-Bar',
  'Chapelaria',
  'Encarregado Bar',
  'Líder de Bar',
  'Bar',
  'Limpeza',
  'Segurança',
  'Líder de Segurança',
  'Cozinha',
  'Bombeiro',
]
export const baseRole = (role: string) =>
  ['Caixa-Bar', 'Chapelaria'].includes(role)
    ? 'Caixa'
    : ['Encarregado Bar', 'Líder de Bar'].includes(role)
      ? 'Bar'
      : role === 'Líder de Segurança'
        ? 'Segurança'
        : role
export const weekday = (date: string) =>
  date
    ? new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${date}T12:00:00Z`))
    : ''
export const dayAvailable = (
  person: { availability: string[] },
  date: string
) => person.availability.some((day) => day.toLowerCase() === weekday(date))
export const displayDate = (date: string) =>
  date ? date.split('-').reverse().join('/') : 'Sem data'

// Preserve the manager's sequence, including a function or post repeated later.
export function rosterGroups(roster: Roster): [string, RosterEntry[]][] {
  const groups: [string, RosterEntry[]][] = []
  for (const entry of roster.entries) {
    const key =
      roster.kind === 'security'
        ? entry.posts.join(' / ') || entry.role
        : entry.role
    const previous = groups[groups.length - 1]
    if (previous?.[0] === key) previous[1].push(entry)
    else groups.push([key, [entry]])
  }
  return groups
}
export function moveRosterEntry(
  entries: RosterEntry[],
  index: number,
  delta: number
) {
  const next = index + delta
  if (
    index < 0 ||
    index >= entries.length ||
    next < 0 ||
    next >= entries.length
  )
    return entries
  const result = [...entries]
  ;[result[index], result[next]] = [result[next], result[index]]
  return result
}
