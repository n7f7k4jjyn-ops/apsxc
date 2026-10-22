const OPEN_AT = '2026-10-20T20:00'
const KEYS = ['DJS', 'INFLUENCIADORES', 'LISTA_LOVERS', 'VIP', 'ANIVERSARIO', 'ENTRADA_GRATUITA']

const EVENTS = [
  { id: 'event-2026-10-22', name: 'Quinta · MODO F*NK', date: '2026-10-22', eventTime: '22:00', entryValue: '' },
  { id: 'event-2026-10-23', name: 'Sexta · FRENÉTIKA', date: '2026-10-23', eventTime: '22:00', entryValue: '' },
  { id: 'event-2026-10-24', name: 'Sábado · GOSTOSO', date: '2026-10-24', eventTime: '22:00', entryValue: '' },
  { id: 'event-2026-10-25', name: 'Domingo · RESSAKA', date: '2026-10-25', eventTime: '19:00', entryValue: '' },
]

const CONFIRMED = {
  DJS: {
    // Quinta (22/10): horário/valor ainda não confirmado no histórico do sistema.
    // O formulário é criado para a data, mas permanece desabilitado até a condição ser definida.
    'event-2026-10-23': { price: 30, start: '00:00', end: '03:00' },
    'event-2026-10-24': { price: 60, start: '23:00', end: '01:00' },
    'event-2026-10-25': { price: 60, start: '23:00', end: '01:00' },
  },
  LISTA_LOVERS: {
    'event-2026-10-22': { price: 70, start: '23:00', end: '01:00' },
    'event-2026-10-23': { price: 70, start: '23:00', end: '01:00' },
    'event-2026-10-24': { price: 70, start: '23:00', end: '01:00' },
    'event-2026-10-25': { price: 70, start: '23:00', end: '01:00' },
  },
  VIP: {
    'event-2026-10-22': {},
    'event-2026-10-23': {},
    'event-2026-10-24': {},
    'event-2026-10-25': {},
  },
  ANIVERSARIO: {
    'event-2026-10-23': {
      maxGuests: 15,
      guestPriceMode: 'PORTARIA',
      guestPrice: 0,
      start: '',
      end: '01:00',
      birthdayRule: 'Até 15 convidados, que pagam o valor de portaria vigente. Com 10 convidados confirmados, o aniversariante ganha um combo B-Day. Válido até 01h.',
      skyConditions: 'Área SKY sujeita à abertura e capacidade do local. Benefício não válido em festas especiais.',
    },
    'event-2026-10-24': {
      maxGuests: 10,
      guestPriceMode: 'FIXO',
      guestPrice: 50,
      start: '23:00',
      end: '01:00',
      consumption: true,
      birthdayRule: 'Até 10 convidados, com R$ 50 de consumação por convidado. Válido das 23h à 01h.',
      skyConditions: 'Área SKY sujeita à abertura e capacidade do local. Benefício não válido em festas especiais.',
    },
  },
}

const LINEUP = {
  'event-2026-10-22': {
    'Pista Land': ['Wallasss', 'Gabriel Pabis', 'Rafa Blaky', 'Dubiong'],
  },
  'event-2026-10-23': {
    'Pista Sky': ['Rozzini', 'Liu Rosa', 'Matt Lovi', 'Gui Quintiliano'],
    'Pista Land': ['Fredo', 'Diego San Fierro', 'Laritssa Beats', 'Cahe Nardy'],
  },
  'event-2026-10-24': {
    'Pista Sky': ['Mau Perin', 'Mário Beckman', 'Lipe Lourenço', 'Gabriel Trevinino', 'John Wilber'],
    'Pista Land': ['Zayon', 'Gey Magalhães', 'Hygor Pherrer', 'Wagner Mauricio'],
  },
  'event-2026-10-25': {
    'Pista Land': ['Matz', 'Tejs Gui', 'Andre Gazza', 'Yasmin Carraroh'],
  },
}

const slug = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const normalized = (value) => slug(String(value || '')).replace(/-+/g, '-')

function baseForm(key, event) {
  const confirmed = CONFIRMED[key]?.[event.id]
  const isVip = key === 'VIP'
  const isBirthday = key === 'ANIVERSARIO'
  return {
    id: `${key}-${event.id}`,
    key,
    eventId: event.id,
    enabled: Boolean(confirmed),
    openAt: OPEN_AT,
    price: 0,
    start: '',
    end: '',
    cutoff: isBirthday ? '15:00' : '19:00',
    consumption: key === 'DJS' || key === 'INFLUENCIADORES' || key === 'LISTA_LOVERS',
    extra: '',
    publicText: '',
    maxGuests: isBirthday ? 10 : 0,
    guestPriceMode: isBirthday ? 'FIXO' : '',
    guestPrice: isBirthday ? 50 : 0,
    openBarTime: isVip ? 'Após o encerramento do Open Bar' : '',
    acceptsCake: isBirthday,
    skyConditions: '',
    birthdayRule: '',
    ...(confirmed || {}),
  }
}

function mergeCurrentWeekForm(existing, desired) {
  return {
    ...existing,
    ...desired,
    id: existing.id,
    key: existing.key,
    eventId: existing.eventId,
    requiredFields: existing.requiredFields,
  }
}

// Atualiza SOMENTE 22–25/10. Eventos e formulários anteriores não são tocados.
export function addCurrentWeekAgenda(state) {
  const events = [...state.events]
  const forms = [...state.forms]
  const people = [...state.people]
  let changed = false

  for (const event of EVENTS) {
    const index = events.findIndex((item) => item.date === event.date || item.id === event.id)
    let eventId = event.id
    if (index < 0) {
      events.push({ ...event, active: true })
      changed = true
    } else {
      eventId = events[index].id
      const desired = { ...events[index], name: event.name, date: event.date, eventTime: event.eventTime, active: true }
      if (JSON.stringify(desired) !== JSON.stringify(events[index])) {
        events[index] = desired
        changed = true
      }
    }

    for (const key of KEYS) {
      const desired = baseForm(key, { ...event, id: eventId })
      const indexForm = forms.findIndex((item) => item.eventId === eventId && item.key === key)
      if (indexForm < 0) {
        forms.push(desired)
        changed = true
      } else {
        const merged = mergeCurrentWeekForm(forms[indexForm], desired)
        if (JSON.stringify(merged) !== JSON.stringify(forms[indexForm])) {
          forms[indexForm] = merged
          changed = true
        }
      }
    }
  }

  const byName = new Map()
  people.forEach((person, index) => {
    if (person.kind === 'DJ') byName.set(normalized(person.name), index)
  })

  for (const [canonicalEventId, tracks] of Object.entries(LINEUP)) {
    const eventDate = EVENTS.find((event) => event.id === canonicalEventId)?.date
    const actualEvent = events.find((event) => event.date === eventDate)
    if (!actualEvent) continue
    const eventId = actualEvent.id

    for (const [track, names] of Object.entries(tracks)) {
      names.forEach((name, order) => {
        const key = normalized(name)
        const detail = { track, time: '', order: order + 1 }
        const personIndex = byName.get(key)
        if (personIndex === undefined) {
          const person = {
            id: `dj-${slug(name)}`,
            kind: 'DJ',
            name,
            phone: '',
            email: '',
            instagram: '',
            notes: '',
            active: true,
            eventIds: [eventId],
            eventDetails: { [eventId]: detail },
          }
          people.push(person)
          byName.set(key, people.length - 1)
          changed = true
          return
        }

        const person = people[personIndex]
        const alreadyLinked = (person.eventIds || []).includes(eventId)
        const currentDetail = person.eventDetails?.[eventId]
        if (!alreadyLinked || JSON.stringify(currentDetail) !== JSON.stringify(detail)) {
          people[personIndex] = {
            ...person,
            eventIds: alreadyLinked ? person.eventIds : [...(person.eventIds || []), eventId],
            eventDetails: { ...(person.eventDetails || {}), [eventId]: detail },
          }
          changed = true
        }
      })
    }
  }

  return changed
    ? { state: { ...state, events, forms, people, updatedAt: new Date().toISOString() }, changed }
    : { state, changed }
}
