import { registryPhone } from './registry.mjs'
import { confirmInfluencerAdmission } from './influencer-commissions.mjs'

// Only check-in-backed, uniquely attributed Zig presences are eligible.
// A purchase, a signup, or a name-only match never establishes attendance.
export function reconcileInfluencerCheckins(operations, state, zigPeople, eventLinks, actor, at = new Date().toISOString()) {
  let document = operations
  const confirmed = []
  const pending = []
  const seen = new Set()
  const influencerRegistrations = state.registrations.filter(r => r.formKey === 'INFLUENCIADORES')
  for (const person of zigPeople) {
    if (!person.sources?.has('checkin') || !person.checkins) continue
    const eventIds = [...(person.eventIds || [])]
    if (eventIds.length !== 1) {
      pending.push({ reason: 'ambiguous_event', zigId: person.zigId || null })
      continue
    }
    const eventId = eventLinks[eventIds[0]]
    if (!eventId || !state.events.some(e => e.id === eventId)) {
      pending.push({ reason: 'event_not_linked', zigId: person.zigId || null })
      continue
    }
    const phone = person.phone?.key || ''
    const matches = influencerRegistrations.filter(r =>
      r.eventId === eventId &&
      phone && registryPhone(r.whatsapp) === phone &&
      String(r.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ') ===
      String(person.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
    )
    const influencers = new Set(matches.map(r => r.optionId))
    if (!matches.length || influencers.size !== 1 || ![...influencers][0]) {
      pending.push({ reason: matches.length ? 'ambiguous_influencer' : 'no_safe_match', zigId: person.zigId || null, eventId })
      continue
    }
    const key = eventId + ':' + registryPhone(matches[0].whatsapp) + ':' + matches[0].name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const result = confirmInfluencerAdmission(document, state, matches[0].id, actor, at)
      document = result.document
      if (result.created) confirmed.push({ admissionId: result.admission.id, eventId })
    } catch {
      pending.push({ reason: 'confirmation_conflict', zigId: person.zigId || null, eventId })
    }
  }
  return { document, confirmed, pending }
}
