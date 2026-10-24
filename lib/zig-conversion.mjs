import { buildExistingEntities, matchPeople } from './zig-matching.mjs'
import { mapZigEventToApp } from './zig-event-map.mjs'

// Conversão: das pessoas inscritas nas listas de cada evento do app, quantas tiveram presença confirmada na Zig.
// Cruzamento sempre por telefone + nome compatível; casos ambíguos não contam como presença e aparecem separados.
export function buildConversion(data, registrations, appEvents) {
  const entities = buildExistingEntities([], registrations)
  const groups = matchPeople(data.zigPeople, entities, { lojaId: data.lojaId })

  const cameByZigEvent = new Map()
  for (const entry of groups.linked) {
    for (const eventId of entry.eventIds) {
      if (!cameByZigEvent.has(eventId)) cameByZigEvent.set(eventId, new Set())
      for (const entity of entry.matchedEntities || []) if (entity.source === 'registration') cameByZigEvent.get(eventId).add(entity)
    }
  }
  const presentByZigEvent = new Map()
  for (const person of data.zigPeople) {
    for (const eventId of person.eventIds) presentByZigEvent.set(eventId, (presentByZigEvent.get(eventId) || 0) + 1)
  }
  const ambiguousRegistered = groups.divergent.filter((entry) => entry.matches.some((match) => match.source === 'registration'))

  const regEntity = new Map()
  for (const entity of entities) if (entity.source === 'registration') for (const id of entity.ids) regEntity.set(id, entity)

  const events = []
  const notes = []
  for (const zigEvent of data.events.filter((event) => event.inRequestedPeriod)) {
    const day = zigEvent.beginAt.slice(0, 10)
    const { appEvent, reason } = mapZigEventToApp(zigEvent.beginMs, appEvents)
    if (!appEvent) {
      notes.push(`${zigEvent.name || zigEvent.id}: ${reason} (início ${zigEvent.beginAt}); conversão não calculada para evitar misturar listas.`)
      events.push({ zigEventId: zigEvent.id, zigEventName: zigEvent.name, date: day, appEventId: null, calculated: false })
      continue
    }    const came = cameByZigEvent.get(zigEvent.id) || new Set()
    const lists = new Map()
    const people = new Set()
    const cameTotal = new Set()
    for (const registration of registrations) {
      if (registration.eventId !== appEvent.id) continue
      const entity = regEntity.get(String(registration.id))
      if (!entity) continue
      const key = String(registration.formKey || 'Sem lista')
      if (!lists.has(key)) lists.set(key, { list: key, registered: new Set(), came: new Set() })
      const bucket = lists.get(key)
      bucket.registered.add(entity)
      people.add(entity)
      if (came.has(entity)) { bucket.came.add(entity); cameTotal.add(entity) }
    }
    const pct = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : null)
    const present = presentByZigEvent.get(zigEvent.id) || 0
    events.push({
      zigEventId: zigEvent.id, zigEventName: zigEvent.name, date: day, appEventId: appEvent.id, appEventName: appEvent.name, calculated: true,
      registered: people.size, came: cameTotal.size, conversionPercent: pct(cameTotal.size, people.size),
      presentInHouse: present, walkInsWithoutList: Math.max(0, present - cameTotal.size),
      lists: [...lists.values()].map((bucket) => ({ list: bucket.list, registered: bucket.registered.size, came: bucket.came.size, conversionPercent: pct(bucket.came.size, bucket.registered.size) })).sort((a, b) => b.registered - a.registered),
    })
  }
  return {
    events, notes,
    inconclusive: ambiguousRegistered.length,
    unconfirmedPresence: data.unconfirmed.length,
    assumptions: [
      'Presença = check-in/compra na Zig associado ao evento por horário (premissa provisória). Ambíguos e fora da janela não contam.',
      'Pessoa inscrita = telefone + nome compatível entre a lista do app e a Zig; nome sozinho nunca vincula.',
      'Quem se inscreveu em mais de uma lista conta em cada uma delas; no total do evento conta uma vez.',
    ],
  }
}
