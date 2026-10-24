import { createHash } from 'node:crypto'
import { registryPhone } from './registry.mjs'

export const INFLUENCER_RATE_CENTS = 300
const nameKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
const identity = row => `${nameKey(row.name)}|${registryPhone(row.whatsapp)}`
const fail = message => { throw Object.assign(new Error(message), { status: 409 }) }

// Only an explicit door confirmation creates evidence. A list signup or a Zig
// purchase/presence estimate is never treated as an admission by this module.
export function confirmInfluencerAdmission(operations, state, registrationId, actor, at = new Date().toISOString()) {
  const registration = state.registrations.find(r => r.id === registrationId && r.formKey === 'INFLUENCIADORES')
  if (!registration) fail('Inscrição de influencer não encontrada.')
  const person = state.people.find(p => p.id === registration.optionId && p.kind === 'INFLUENCIADORES')
  const event = state.events.find(e => e.id === registration.eventId)
  if (!person || !event || !nameKey(registration.name) || !registryPhone(registration.whatsapp)) fail('Inscrição sem evento, influencer ou identificação válida.')
  const related = state.registrations.filter(r => r.eventId === event.id && r.formKey === 'INFLUENCIADORES' && identity(r) === identity(registration))
  if (new Set(related.map(r => r.optionId)).size > 1) fail('A pessoa está em listas de influencers diferentes. Resolva a atribuição antes de confirmar a entrada.')
  const id = `influencer-entry:${createHash('sha256').update(`${event.id}|${identity(registration)}`).digest('hex')}`
  const admissions = operations.influencerAdmissions || []
  const existing = admissions.find(a => a.id === id)
  if (existing) {
    if (existing.influencerId !== person.id) fail('Entrada já atribuída a outro influencer.')
    return { document: operations, admission: existing, created: false }
  }
  const admission = { id, eventId: event.id, eventDate: event.date, registrationId: registration.id, influencerId: person.id, guestName: registration.name, confirmedAt: at, confirmedBy: actor, rateCents: INFLUENCER_RATE_CENTS }
  return { document: { ...operations, influencerAdmissions: [...admissions, admission] }, admission, created: true }
}

export function planInfluencerCommissions(operations, finance) {
  const existing = new Set(finance.entries.map(e => e.externalId))
  const seen = new Set()
  const entries = []
  for (const admission of operations.influencerAdmissions || []) {
    if (existing.has(admission.id) || seen.has(admission.id)) continue
    if (admission.rateCents !== INFLUENCER_RATE_CENTS || !admission.confirmedAt || !admission.confirmedBy || !admission.registrationId) fail('Evidência de entrada inválida; confira a operação.')
    seen.add(admission.id)
    entries.push({ externalId: admission.id, type: 'payable', category: 'influencer', description: `Repasse por entrada confirmada — ${admission.guestName}`, counterparty: '', beneficiaryId: `influencer:${admission.influencerId}`, eventId: admission.eventId, amountCents: INFLUENCER_RATE_CENTS, dueDate: admission.eventDate, status: 'pending', settledDate: '', paymentMethod: '', notes: `Inscrição: ${admission.registrationId}. Entrada confirmada por ${admission.confirmedBy} em ${admission.confirmedAt}. R$ 3 por pessoa/evento; sem duplicar reinscrições. Data do evento como referência de vencimento.` })
  }
  return entries
}
