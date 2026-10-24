// Mescla o evento `dropId` no evento `keepId` sem apagar registros: tudo é reapontado e o evento mesclado fica inativo com referência.
export function planEventMerge(state, keepId, dropId, now = new Date().toISOString()) {
  if (!keepId || !dropId || keepId === dropId) throw new Error('Escolha dois eventos diferentes.')
  const keep = state.events.find((event) => event.id === keepId)
  const drop = state.events.find((event) => event.id === dropId)
  if (!keep || !drop) throw new Error('Evento não encontrado.')

  const report = { keep: { id: keep.id, name: keep.name }, drop: { id: drop.id, name: drop.name }, registrations: 0, formsMoved: 0, formsKept: [], people: 0, personDetailsMerged: 0 }

  const registrations = state.registrations.map((item) => {
    if (item.eventId !== dropId) return item
    report.registrations += 1
    return { ...item, eventId: keep.id, eventName: keep.name, eventDate: keep.date, mergedFromEventId: dropId }
  })

  const keepKeys = new Set(state.forms.filter((form) => form.eventId === keepId).map((form) => form.key))
  const forms = state.forms.map((form) => {
    if (form.eventId !== dropId) return form
    if (keepKeys.has(form.key)) {
      report.formsKept.push(form.key)
      return { ...form, enabled: false, mergedIntoEventId: keepId }
    }
    report.formsMoved += 1
    return { ...form, id: `${form.key}-${keepId}`, eventId: keepId, mergedFromEventId: dropId }
  })

  const people = state.people.map((person) => {
    if (!person.eventIds?.includes(dropId)) return person
    report.people += 1
    const eventIds = [...new Set(person.eventIds.map((id) => (id === dropId ? keepId : id)))]
    const eventDetails = { ...(person.eventDetails || {}) }
    if (eventDetails[dropId]) {
      if (!eventDetails[keepId]) { eventDetails[keepId] = eventDetails[dropId]; report.personDetailsMerged += 1 }
      delete eventDetails[dropId]
    }
    return { ...person, eventIds, eventDetails }
  })

  const events = state.events.map((event) => {
    if (event.id === dropId) return { ...event, active: false, mergedIntoEventId: keepId, mergedAt: now }
    return event
  })

  return { state: { ...state, events, forms, people, registrations }, report }
}
