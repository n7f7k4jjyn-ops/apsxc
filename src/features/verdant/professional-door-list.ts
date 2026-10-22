import type { PortariaSection } from './portaria-pdf'

/** Door PDFs contain names only; operational contacts stay in the CSV. */
export function professionalDoorList(
  title: string,
  professionals: string[],
  guests: { professional: string; name: string }[]
): PortariaSection[] {
  const groups = new Map<string, { label: string; names: string[] }>()
  const key = (value: string) => value.trim().toLocaleLowerCase('pt-BR')
  for (const name of professionals) {
    if (!groups.has(key(name)))
      groups.set(key(name), { label: name, names: [] })
  }
  for (const guest of guests) {
    const label = guest.professional.trim() || 'Profissional não informado'
    if (!groups.has(key(label))) groups.set(key(label), { label, names: [] })
    groups.get(key(label))!.names.push(guest.name)
  }
  return groups.size ? [{ title, groups: [...groups.values()] }] : []
}
