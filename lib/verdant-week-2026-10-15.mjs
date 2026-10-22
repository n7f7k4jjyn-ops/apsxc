const OPEN_AT = '2026-10-13T20:00'
const KEYS = ['DJS', 'INFLUENCIADORES', 'LISTA_LOVERS', 'VIP', 'ANIVERSARIO']

const EVENTS = [
  { id: 'event-2026-10-15', name: 'Quinta · START ME UP', date: '2026-10-15', eventTime: '22:00', entryValue: 'Portaria: R$ 40 (open bar 22h–00h) ou R$ 50 (open bar após 00h)' },
  { id: 'event-2026-10-16', name: 'Sexta · FRENÉTIKA', date: '2026-10-16', eventTime: '22:00', entryValue: '' },
  { id: 'event-2026-10-17', name: 'Sábado · TERASHIMA ASCENSION', date: '2026-10-17', eventTime: '22:00', entryValue: '' },
  { id: 'event-2026-10-18', name: 'Domingo · RESSAKA', date: '2026-10-18', eventTime: '19:00', entryValue: '' },
]

// RESSAKA (18/10) não tem formulários: todos ficam desabilitados.
// Somente condições confirmadas; o que não consta aqui permanece desabilitado.
const CONFIRMED = {
  DJS: {
    'event-2026-10-16': { price: 30, start: '00:00', end: '03:00', openBarTime: '22:00–00:00' },
    'event-2026-10-17': { price: 60, start: '23:00', end: '01:00', openBarTime: '22:00–23:00' },
  },
  INFLUENCIADORES: {
    'event-2026-10-16': { price: 30, start: '00:00', end: '03:00', openBarTime: '22:00–00:00' },
    'event-2026-10-17': { price: 60, start: '23:00', end: '01:00', openBarTime: '22:00–23:00' },
  },
  LISTA_LOVERS: {
    'event-2026-10-17': { price: 70, start: '23:00', end: '01:00', openBarTime: '22:00–23:00' },
  },
  VIP: {
    'event-2026-10-15': {},
    'event-2026-10-16': {},
    'event-2026-10-17': {},
  },
  ANIVERSARIO: {
    'event-2026-10-16': { maxGuests: 15, guestPriceMode: 'PORTARIA', guestPrice: 0, start: '', end: '01:00', birthdayRule: 'Até 15 convidados, que pagam o valor de portaria vigente. Consulte a condição do combo B-Day com 10 convidados. Válido até 01h.' },
    'event-2026-10-17': { maxGuests: 10, guestPriceMode: 'FIXO', guestPrice: 50, start: '23:00', end: '01:00', birthdayRule: 'Até 10 convidados, com R$ 50 de consumação por convidado. Válido das 23h à 01h.' },
  },
}

const PENDING_TEXT = {
  DJS: 'Lista de DJs em breve para esta data.',
  INFLUENCIADORES: 'Lista de Influencers em breve para esta data.',
  LISTA_LOVERS: 'Lista Lover em breve para esta data.',
  VIP: 'Lista VIP em breve para esta data.',
  ANIVERSARIO: 'Lista de aniversário em breve para esta data.',
}

const LINEUP = {
  'event-2026-10-15': { 'Pista Land': ['Diego San Fierro', 'Gabriel Pabis', 'Emke DJ', 'Wagner Mauricio'] },
  'event-2026-10-16': {
    'Pista Sky': ['Denner Mello', 'Jotta Andrade', 'Fran Rocha', 'Lê Ortis'],
    'Pista Land': ['Duda Mehl', 'Sevla', 'Dubiong', 'Haroll Trinnyty'],
  },
  'event-2026-10-17': {
    'Pista Sky': ['Terashima', 'Van Muller', 'Bruno Knauer', 'Wander Bueno', "D'Lohn"],
    'Pista Land': ['Yasmin Carraroh', 'Vag Albergoni', 'Fredo', 'Matt Lovi'],
  },
}

const slug = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function buildForm(key, event) {
  const confirmed = CONFIRMED[key]?.[event.id]
  return {
    id: `${key}-${event.id}`,
    key,
    eventId: event.id,
    enabled: Boolean(confirmed),
    openAt: OPEN_AT,
    price: 0,
    start: '',
    end: '',
    cutoff: key === 'ANIVERSARIO' ? '15:00' : '19:00',
    consumption: key !== 'VIP' && key !== 'ANIVERSARIO',
    extra: '',
    publicText: confirmed || event.id === 'event-2026-10-18' ? '' : PENDING_TEXT[key],
    maxGuests: 0,
    guestPriceMode: '',
    guestPrice: 0,
    openBarTime: '',
    acceptsCake: key === 'ANIVERSARIO',
    skyConditions: '',
    birthdayRule: '',
    ...(confirmed || {}),
  }
}

// Adição idempotente: nunca altera nem remove itens existentes.
export function addWeekAgenda(state) {
  const events = [...state.events]
  const forms = [...state.forms]
  const people = [...state.people]
  let changed = false
  const eventIds = new Set(events.map((item) => item.id))
  const formIds = new Set(forms.map((item) => item.id))
  const personIndex = new Map(people.map((person, index) => [person.id, index]))

  for (const event of EVENTS) {
    if (!eventIds.has(event.id)) {
      events.push({ ...event, active: true })
      eventIds.add(event.id)
      changed = true
    }
    for (const key of KEYS) {
      const form = buildForm(key, event)
      if (formIds.has(form.id)) continue
      forms.push(form)
      formIds.add(form.id)
      changed = true
    }
  }

  for (const [eventId, tracks] of Object.entries(LINEUP)) {
    for (const [track, names] of Object.entries(tracks)) {
      names.forEach((name, order) => {
        const id = `dj-${slug(name)}`
        const detail = { track, time: '', order: order + 1 }
        const index = personIndex.get(id)
        if (index === undefined) {
          people.push({ id, kind: 'DJ', name, phone: '', email: '', instagram: '', notes: '', active: true, eventIds: [eventId], eventDetails: { [eventId]: detail } })
          personIndex.set(id, people.length - 1)
          changed = true
          return
        }
        const person = people[index]
        if (person.kind !== 'DJ' || (person.eventIds || []).includes(eventId)) return
        people[index] = {
          ...person,
          eventIds: [...(person.eventIds || []), eventId],
          eventDetails: { ...(person.eventDetails || {}), [eventId]: detail },
        }
        changed = true
      })
    }
  }

  return changed ? { state: { ...state, events, forms, people, updatedAt: new Date().toISOString() }, changed } : { state, changed }
}
