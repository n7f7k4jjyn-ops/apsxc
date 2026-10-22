import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  copyFormSettings,
  emptyState,
  isOpen,
  linkPeopleToEvent,
  makeConfigs,
  makeEvent,
  openingDateFor,
  publicProfessionalsForEvent,
  sortRows,
  visibleRegistrations,
} from './data'

describe('inscrições visíveis', () => {
  it('oculta eventos arquivados e inscrições anteriores ao início da contagem, sem apagá-las', () => {
    const row = (id: string, eventId: string, createdAt: string) => ({ id, eventId, createdAt }) as never
    const state = {
      events: [{ id: 'a', active: true, date: '2026-10-10' }, { id: 'b', active: false, date: '2026-10-10' }, { id: 'c', active: true, date: '2026-10-15' }] as never[],
      registrations: [row('1', 'a', '2026-10-13T12:00:00-03:00'), row('2', 'a', '2026-10-12T12:00:00-03:00'), row('3', 'b', '2026-10-13T12:00:00-03:00'), row('4', 'c', '2026-10-11T12:00:00-03:00')],
    }
    expect(visibleRegistrations(state).map((item: { id: string }) => item.id)).toEqual(['1', '4'])
    expect(state.registrations).toHaveLength(4)
  })
})

describe('regras de formulário por evento', () => {
  afterEach(() => vi.useRealTimers())

  it('encerra somente a data cujo horário terminou', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T19:01:00-03:00'))
    const state = emptyState()

    expect(isOpen(state, 'DJS', 'event-2026-10-09')).toBe(false)
    expect(isOpen(state, 'DJS', 'event-2026-10-10')).toBe(true)
    expect(isOpen(state, 'DJS', 'event-2026-10-11')).toBe(true)
  })

  it('mantém o encerramento de Aniversário às 15h separado das outras listas', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T15:01:00-03:00'))
    const state = emptyState()

    expect(isOpen(state, 'ANIVERSARIO', 'event-2026-10-09')).toBe(false)
    expect(isOpen(state, 'LISTA_LOVERS', 'event-2026-10-09')).toBe(true)
    expect(isOpen(state, 'ANIVERSARIO', 'event-2026-10-10')).toBe(true)
  })

  it('calcula a abertura padrão na terça-feira anterior ao evento, qualquer que seja a data', () => {
    expect(openingDateFor('2026-10-10')).toBe('2026-10-06T20:00')
    expect(openingDateFor('2026-12-25')).toBe('2026-12-22T20:00')
  })

  it('permite à equipe habilitar aniversário em uma data de feriado escolhida', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-25T12:00:00-03:00'))
    const state = emptyState()
    const event = { id: 'feriado', name: 'Feriado', date: '2026-12-25', active: true, eventTime: '', entryValue: '' }
    state.events.push(event)
    state.forms.push({
      id: 'ANIVERSARIO-feriado', key: 'ANIVERSARIO', eventId: 'feriado', enabled: true,
      openAt: '2026-12-22T20:00', price: 0, start: '', end: '01:00', cutoff: '15:00',
      consumption: false, extra: '', publicText: '', maxGuests: 10, guestPriceMode: 'FIXO',
      guestPrice: 50, openBarTime: '', acceptsCake: true, skyConditions: '',
    })

    expect(isOpen(state, 'ANIVERSARIO', 'feriado')).toBe(true)
  })

  it('copia configurações comuns uma vez sem trocar a identidade nem os campos próprios da lista', () => {
    const event = makeEvent('2026-10-15', 'Festa')
    const [dj, influencer, , vip, birthday] = makeConfigs(event)
    dj.openAt = '2026-10-13T20:00'
    dj.price = 42
    dj.start = '22:00'
    dj.end = '01:00'
    dj.cutoff = '18:30'
    dj.consumption = true
    dj.publicText = 'Texto do DJ'
    dj.extra = 'Condição comum'
    dj.requiredFields = { name: true, whatsapp: false, email: true, consent: false }

    const copiedInfluencer = copyFormSettings(dj, influencer)
    expect(copiedInfluencer).toMatchObject({
      id: influencer.id,
      key: 'INFLUENCIADORES',
      eventId: influencer.eventId,
      enabled: false,
      openAt: dj.openAt,
      price: dj.price,
      start: dj.start,
      end: dj.end,
      cutoff: dj.cutoff,
      consumption: true,
      publicText: dj.publicText,
      extra: dj.extra,
      requiredFields: dj.requiredFields,
    })

    vip.openBarTime = 'Após meia-noite'
    const copiedVip = copyFormSettings(dj, vip)
    expect(copiedVip).toMatchObject({
      id: vip.id,
      key: 'VIP',
      enabled: false,
      price: vip.price,
      consumption: vip.consumption,
      openBarTime: 'Após meia-noite',
      openAt: dj.openAt,
      publicText: dj.publicText,
    })

    birthday.maxGuests = 7
    birthday.guestPriceMode = 'PORTARIA'
    birthday.guestPrice = 35
    birthday.acceptsCake = false
    birthday.skyConditions = 'Pista SKY aberta'
    birthday.birthdayRule = 'Regra própria'
    const copiedBirthday = copyFormSettings(dj, birthday)
    expect(copiedBirthday).toMatchObject({
      id: birthday.id,
      key: 'ANIVERSARIO',
      enabled: false,
      price: birthday.price,
      consumption: birthday.consumption,
      maxGuests: 7,
      guestPriceMode: 'PORTARIA',
      guestPrice: 35,
      acceptsCake: false,
      skyConditions: 'Pista SKY aberta',
      birthdayRule: 'Regra própria',
      openAt: dj.openAt,
    })
  })

  it('salva somente DJs e Influencers selecionados e os disponibiliza com o payload público mínimo', () => {
    const people = [
      { id: 'dj-1', kind: 'DJ' as const, name: 'DJ Um', phone: '', email: '', instagram: '', notes: '', active: true, eventIds: [], eventDetails: {} },
      { id: 'dj-2', kind: 'DJ' as const, name: 'DJ Dois', phone: '', email: '', instagram: '', notes: '', active: true, eventIds: [], eventDetails: {} },
      { id: 'inf-1', kind: 'INFLUENCIADORES' as const, name: 'Influencer Um', phone: '', email: '', instagram: '', notes: '', active: true, eventIds: [], eventDetails: {} },
      { id: 'dj-inactive', kind: 'DJ' as const, name: 'DJ Inativo', phone: '', email: '', instagram: '', notes: '', active: false, eventIds: [], eventDetails: {} },
    ]
    const linked = linkPeopleToEvent(people, ['dj-1', 'inf-1', 'dj-inactive'], 'event-new', {
      'dj-1': { track: 'Pista principal', time: '22:30', order: 1 },
    })

    expect(linked.find((person) => person.id === 'dj-1')).toMatchObject({
      eventIds: ['event-new'],
      eventDetails: { 'event-new': { track: 'Pista principal', time: '22:30', order: 1 } },
    })
    expect(linked.find((person) => person.id === 'inf-1')?.eventIds).toEqual(['event-new'])
    expect(linked.find((person) => person.id === 'dj-2')?.eventIds).toEqual([])
    expect(linked.find((person) => person.id === 'dj-inactive')?.eventIds).toEqual([])

    const publicPeople = linked.filter((person) => person.active).map(({ id, kind, name, eventIds, eventDetails }) => ({
      id,
      kind,
      name,
      eventIds,
      eventDetails,
    }))
    expect(publicProfessionalsForEvent(publicPeople, 'DJ', 'event-new').map((person) => person.name)).toEqual(['DJ Um'])
    expect(publicProfessionalsForEvent(publicPeople, 'INFLUENCIADORES', 'event-new').map((person) => person.name)).toEqual(['Influencer Um'])
  })

  it('ordena inicialmente por nome, alterna a direção e mantém valores vazios no fim', () => {
    const people = [{ name: 'Zeca' }, { name: 'Ágata' }, { name: 'Bruno' }, { name: '' }]
    expect(sortRows(people, (person) => person.name, 'asc').map((person) => person.name)).toEqual(['Ágata', 'Bruno', 'Zeca', ''])
    expect(sortRows(people, (person) => person.name, 'desc').map((person) => person.name)).toEqual(['Zeca', 'Bruno', 'Ágata', ''])
    expect(sortRows([{ count: 10 }, { count: 2 }, { count: 0 }], (row) => row.count, 'asc').map((row) => row.count)).toEqual([0, 2, 10])
  })
})
