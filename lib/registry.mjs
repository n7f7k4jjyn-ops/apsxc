export const applicationStatuses = new Set(['new', 'reviewing', 'approved', 'rejected'])
const plain = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
export const registryPhone = value => { const digits = String(value || '').replace(/\D/g, ''); return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits }
export function registryIdentity(row) {
  const contact = registryPhone(row.whatsapp || row.phone) || plain(row.email)
  return contact ? `${plain(row.name)}|${contact}` : `id:${row.id}`
}
export function groupRegistryClients(registrations) {
  const people = new Map()
  for (const row of registrations) {
    const key = registryIdentity(row)
    if (!people.has(key)) people.set(key, { id: row.id, name: row.name, phone: row.whatsapp, email: row.email, history: [] })
    people.get(key).history.push(row)
  }
  return [...people.values()]
}
export function latestTeam(records) {
  const people = new Map()
  for (const record of [...records].sort((a,b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = registryIdentity(record)
    if (!people.has(key)) people.set(key, { ...record, history: [] })
    people.get(key).history.push(record)
  }
  return [...people.values()]
}
export function promotedTeam(application, existing = []) {
  if (application.status !== 'approved') throw Object.assign(new Error('Aprove o candidato antes de adicionar à equipe.'), { status: 409 })
  const previous = existing.find(row => row.sourceApplicationId === application.id || registryIdentity(row) === registryIdentity(application))
  if (previous) return previous
  return { id: `team-from-${application.id}`, sourceApplicationId: application.id, name: application.name, whatsapp: application.whatsapp, roles: [...application.roles], availability: [...application.availability], experience: application.experience, pixKey: '', createdAt: new Date().toISOString(), source: 'candidate' }
}
