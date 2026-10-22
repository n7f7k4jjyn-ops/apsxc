import { addWeekAgenda } from './verdant-week-2026-10-15.mjs'
import { addCurrentWeekAgenda } from './verdant-week-2026-10-22.mjs'

export function migrateVerdantState(state, seed) {
  let current = state
  let changed = false
  if (Number(current.version || 1) < 2) {
    current = migrateToV2(current, seed)
    changed = true
  }
  if (Number(current.version) < 3) {
    current = { ...addWeekAgenda(current).state, version: 3, updatedAt: new Date().toISOString() }
    changed = true
  }
  if (Number(current.version) < 4) {
    current = {
      ...current,
      formDescriptions: { ...(seed.formDescriptions || {}), ...(current.formDescriptions || {}) },
      version: 4,
      updatedAt: new Date().toISOString(),
    }
    changed = true
  }
  if (Number(current.version) < 5) {
    current = { ...addCurrentWeekAgenda(current).state, version: 5, updatedAt: new Date().toISOString() }
    changed = true
  }
  if (Number(current.version) < 6) {
    const forms = [...current.forms]
    const existing = new Set(forms.map((form) => `${form.key}|${form.eventId}`))
    for (const event of current.events.filter((item) => item.active && item.date >= '2026-10-22')) {
      const key = `ENTRADA_GRATUITA|${event.id}`
      if (existing.has(key)) continue
      forms.push({
        id: `ENTRADA_GRATUITA-${event.id}`,
        key: 'ENTRADA_GRATUITA',
        eventId: event.id,
        enabled: false,
        openAt: '2026-10-20T20:00',
        price: 0,
        start: '',
        end: '00:00',
        cutoff: '19:00',
        consumption: false,
        extra: '',
        publicText: '',
        maxGuests: 0,
        guestPriceMode: '',
        guestPrice: 0,
        openBarTime: '',
        acceptsCake: false,
        skyConditions: '',
        birthdayRule: '',
      })
      existing.add(key)
    }
    current = { ...current, forms, version: 6, updatedAt: new Date().toISOString() }
    changed = true
  }
  if (Number(current.version) < 7) {
    // Reaplica de forma idempotente apenas a agenda atual (22–25/10) para
    // corrigir estados que tenham sido persistidos antes da configuração final.
    current = { ...addCurrentWeekAgenda(current).state, version: 7, updatedAt: new Date().toISOString() }
    changed = true
  }
  return { state: current, changed }
}

function migrateToV2(state, seed) {
  const seededPeople = new Map(seed.people.map((person) => [person.id, person]))
  const eventIds = new Set(state.events.map((event) => event.id))
  const migrated = {
    ...state,
    version: 2,
    people: state.people.map((person) => {
      const initial = seededPeople.get(person.id)
      const initialLinks = (initial?.eventIds || []).filter((id) => eventIds.has(id))
      if (!person.eventIds?.length && initialLinks.length) {
        return {
          ...person,
          eventIds: initialLinks,
          eventDetails: { ...(initial?.eventDetails || {}), ...(person.eventDetails || {}) },
        }
      }
      return person
    }),
    updatedAt: new Date().toISOString(),
  }
  return migrated
}
