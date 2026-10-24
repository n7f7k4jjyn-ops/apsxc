import seed from './seed.json'
import { getCurrentLanguage } from '@/context/language-provider'

export type FormKey =
  | 'DJS'
  | 'INFLUENCIADORES'
  | 'LISTA_LOVERS'
  | 'VIP'
  | 'ANIVERSARIO'
  | 'ENTRADA_GRATUITA'

export type VerdantEvent = {
  id: string
  name: string
  date: string
  eventTime: string
  entryValue: number | string
  letterheadId?: '' | 'variacao-1' | 'variacao-2' | 'variacao-3' | 'variacao-4'
  active: boolean
}

export type EventDetails = { track: string; time: string; secondTime?: string; order: number }
export type Person = {
  id: string
  kind: 'DJ' | 'INFLUENCIADORES'
  name: string
  phone: string
  pixKey?: string
  beneficiaryName?: string
  email: string
  instagram: string
  notes: string
  active: boolean
  eventIds: string[]
  eventDetails: Record<string, EventDetails>
}

export type PublicPerson = Pick<Person, 'id' | 'kind' | 'name' | 'eventIds' | 'eventDetails'>

export type FormRequiredFields = { name: boolean; whatsapp: boolean; email: boolean; consent: boolean }
export type SortDirection = 'asc' | 'desc'

export type FormConfig = {
  id: string
  key: FormKey
  eventId: string
  enabled: boolean
  openAt: string
  requiredFields?: FormRequiredFields
  price: number
  start: string
  end: string
  cutoff: string
  consumption: boolean
  extra: string
  publicText: string
  maxGuests: number
  guestPriceMode: '' | 'PORTARIA' | 'FIXO'
  guestPrice: number
  openBarTime: string
  acceptsCake: boolean
  skyConditions: string
  birthdayRule?: string
  archivedAt?: string
  deletedAt?: string
}

export type Registration = {
  id: string
  sourceSystem?: string
  sourceId?: string
  sourceDetails?: string
  formKey: FormKey
  eventId: string
  eventName: string
  eventDate: string
  name: string
  whatsapp: string
  email: string
  consent: boolean
  consentAnswered?: boolean
  optionId: string
  optionName: string
  profileType: string
  birthdayDate: string
  guestNames: string[]
  createdAt: string
  status: string
}

export type VerdantState = {
  version: number
  revision: number
  updatedAt: string
  events: VerdantEvent[]
  forms: FormConfig[]
  formDescriptions?: Record<string, string>
  formLogos?: Record<string, string>
  people: Person[]
  registrations: Registration[]
}

// Início da contagem em produção: inscrições anteriores e de eventos arquivados ficam ocultas na tela (não são apagadas).
export const REGISTRATIONS_VISIBLE_FROM = '2026-10-13'

export function visibleRegistrations(state: Pick<VerdantState, 'events' | 'registrations'>) {
  const activeEvents = new Set(state.events.filter((event) => event.active).map((event) => event.id))
  const currentEvents = new Set(state.events.filter((event) => event.active && event.date >= REGISTRATIONS_VISIBLE_FROM).map((event) => event.id))
  const from = new Date(`${REGISTRATIONS_VISIBLE_FROM}T00:00:00-03:00`).getTime()
  // Eventos de hoje em diante mostram todas as inscrições; eventos antigos só as recentes.
  return state.registrations.filter((row) => activeEvents.has(row.eventId) && (currentEvents.has(row.eventId) || new Date(row.createdAt).getTime() >= from))
}

const brazilianAreaCodes = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55', '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

export function normalizeBrazilWhatsapp(value: string) {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2)
  const areaCode = digits.slice(0, 2)
  return (digits.length === 10 || digits.length === 11) && brazilianAreaCodes.has(areaCode) ? digits : ''
}

export const FORM_DEFS: { key: FormKey; title: string; description: string; icon: string }[] = [
  {
    key: 'DJS',
    icon: '/images/form-icons/djs.webp',
    title: 'Lista DJs Verdant',
    description:
      'Lista destinada aos DJs vinculados aos eventos habilitados. Selecione a data para consultar as condições e, em seguida, escolha seu nome artístico entre as opções associadas àquela programação. Preencha um cadastro por pessoa com seu nome completo e WhatsApp com DDD. O valor, o horário e o prazo da lista serão exibidos conforme o evento selecionado. Apresente documento oficial com foto na entrada. Entrada permitida somente para maiores de 18 anos.',
  },
  {
    key: 'INFLUENCIADORES',
    icon: '/images/form-icons/influencers.webp',
    title: 'Lista Influencers Verdant',
    description:
      'Lista destinada aos influenciadores vinculados aos eventos habilitados. Selecione a data para consultar as condições e, em seguida, escolha seu nome entre as opções associadas àquele evento. Preencha um cadastro por pessoa com seu nome completo e WhatsApp com DDD. O valor, o horário e o prazo da lista serão exibidos conforme o evento selecionado. Apresente documento oficial com foto na entrada. Entrada permitida somente para maiores de 18 anos.',
  },
  {
    key: 'LISTA_LOVERS',
    icon: '/images/form-icons/lovers.webp',
    title: 'Lista Amiga',
    description:
      'Sua próxima noite na Verdant começa aqui! 💚\n\nComo funciona:\n• Selecione o evento e confira as condições da lista.\n• Preencha com teu nome completinho, igual ao documento — um nome por resposta.\n• O valor da lista vira consumação para curtir a noite.\n\nNão esquece o documento com foto e fica de olho no horário, hein? 🪩\n\n🔞 Entrada somente para maiores de 18 anos.',
  },
  {
    key: 'VIP',
    icon: '/images/form-icons/vip.webp',
    title: 'Lista VIP Verdant',
    description:
      'Seu encontro com a Verdant tem lugar aqui! 💜\n\nEsta lista é destinada a pessoas trans e artistas Drag.\n\nComo funciona:\n• Selecione o evento e preencha seus dados.\n• A entrada gratuita é liberada após o encerramento do Open Bar.\n• Apresente-se à equipe responsável para validar sua entrada.\n\nArtistas Drag devem estar montadas e produzidas no momento da entrada.\n\nNão esquece o documento oficial com foto! ✨\n\n🔞 Entrada somente para maiores de 18 anos.',
  },
  {
    key: 'ANIVERSARIO',
    icon: '/images/form-icons/aniversario.webp',
    title: 'Lista de Aniversário Verdant',
    description:
      'Celebre seu aniversário na Verdant! 🎉💚\n\nChegou a sua vez de brilhar e reunir os amigos para uma noite especial.\n\nComo funciona:\n• Selecione o evento e confira os benefícios da data.\n• Informe seu aniversário e os nomes dos convidados.\n• Confira tudo antes de enviar: a lista não pode ser alterada depois.\n\n🎂 Pode trazer seu bolo favorito!\n\nO acesso à área VIP da SKY depende da abertura e da capacidade do espaço. Esse benefício não se aplica a festas especiais.\n\nNão esquece o documento oficial com foto! ✨\n\n🔞 Entrada somente para maiores de 18 anos.\n\nQuintas e domingos: não há lista de aniversário; o aniversariante do dia recebe entrada gratuita.',
  },
  {
    key: 'ENTRADA_GRATUITA',
    icon: '/images/form-icons/lovers.webp',
    title: 'Entrada Gratuita',
    description:
      'Entrada gratuita temporária para eventos selecionados da Verdant. 💚\n\nComo funciona:\n• Selecione o evento disponível e faça seu cadastro.\n• O benefício é válido somente para a pessoa cadastrada.\n• A entrada gratuita é válida até 00h.\n• Após 00h, será cobrado o valor de portaria vigente do evento.\n• Apresente documento oficial com foto na entrada.\n\nO cadastro é válido somente para o evento selecionado e está sujeito à disponibilidade da ação.\n\n🔞 Entrada somente para maiores de 18 anos.',
  },
]

export const requiredFieldsFor = (config?: Pick<FormConfig, 'requiredFields'> | null): FormRequiredFields => ({
  name: config?.requiredFields?.name ?? true,
  whatsapp: config?.requiredFields?.whatsapp ?? true,
  email: config?.requiredFields?.email ?? false,
  consent: config?.requiredFields?.consent ?? true,
})

export const emptyState = (): VerdantState =>
  JSON.parse(JSON.stringify(seed)) as VerdantState

export const formTitle = (key: FormKey) =>
  FORM_DEFS.find((item) => item.key === key)?.title ?? 'Lista Verdant'

export const eventById = (state: Pick<VerdantState, 'events'>, id: string) =>
  state.events.find((event) => event.id === id)

export const configFor = (state: Pick<VerdantState, 'forms'>, key: FormKey, eventId: string) =>
  state.forms.find((form) => form.key === key && form.eventId === eventId)

export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => string | number | boolean | null | undefined,
  direction: SortDirection,
  locale = 'pt-BR',
): T[] {
  return [...rows].sort((left, right) => {
    const leftValue = getValue(left)
    const rightValue = getValue(right)
    const leftEmpty = leftValue == null || leftValue === ''
    const rightEmpty = rightValue == null || rightValue === ''
    if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1
    if (leftEmpty && rightEmpty) return 0

    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : typeof leftValue === 'boolean' && typeof rightValue === 'boolean'
        ? Number(leftValue) - Number(rightValue)
        : String(leftValue).localeCompare(String(rightValue), locale, { numeric: true, sensitivity: 'base' })
    return direction === 'asc' ? comparison : -comparison
  })
}

export function localDateTime(value: string) {
  if (!value) return Number.NaN
  const normalized = value.length === 16 ? `${value}:00-03:00` : value
  return new Date(normalized).getTime()
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return getCurrentLanguage() === 'en' ? 'Date not set' : 'Data não definida'
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat(getCurrentLanguage(), {
    day: '2-digit',
    month: 'long',
    ...(options ?? {}),
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

export function weekday(value: string) {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat(getCurrentLanguage(), { weekday: 'long' }).format(
    new Date(Date.UTC(year, month - 1, day, 12))
  )
}

export function money(value: number | string) {
  if (value === '' || value == null) return getCurrentLanguage() === 'en' ? 'To be announced' : 'A informar'
  return new Intl.NumberFormat(getCurrentLanguage(), {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0)
}

export function isOpen(state: Pick<VerdantState, 'events' | 'forms'>, key: FormKey, eventId: string, currentTime = Date.now()) {
  const event = eventById(state, eventId)
  const config = configFor(state, key, eventId)
  if (!event?.active || !config?.enabled) return false
  const closeAt = localDateTime(`${event.date}T${config.cutoff || (key === 'ANIVERSARIO' ? '15:00' : '19:00')}`)
  return currentTime >= localDateTime(config.openAt) && currentTime < closeAt
}

export function openingDateFor(eventDate: string) {
  const [year, month, day] = eventDate.split('-').map(Number)
  const noon = new Date(Date.UTC(year, month - 1, day, 12))
  const daysSinceTuesday = (noon.getUTCDay() - 2 + 7) % 7 || 7
  noon.setUTCDate(noon.getUTCDate() - daysSinceTuesday)
  const openDate = noon.toISOString().slice(0, 10)
  return `${openDate}T20:00`
}

export function makeEvent(date: string, name: string): VerdantEvent {
  return {
    id: `event-${Date.now().toString(36)}`,
    name: name.trim(),
    date,
    eventTime: '',
    entryValue: '',
    active: true,
  }
}

export function makeConfigs(event: VerdantEvent): FormConfig[] {
  return FORM_DEFS.map(({ key }) => ({
    id: `${key}-${event.id}`,
    key,
    eventId: event.id,
    enabled: false,
    openAt: openingDateFor(event.date),
    price: key === 'LISTA_LOVERS' ? 70 : 0,
    start: key === 'LISTA_LOVERS' ? '23:00' : '',
    end: key === 'LISTA_LOVERS' ? '01:00' : key === 'ENTRADA_GRATUITA' ? '00:00' : '',
    cutoff: key === 'ANIVERSARIO' ? '15:00' : '19:00',
    consumption: key === 'LISTA_LOVERS',
    extra: '',
    publicText: '',
    maxGuests: key === 'ANIVERSARIO' ? 10 : 0,
    guestPriceMode: key === 'ANIVERSARIO' ? 'FIXO' : '',
    guestPrice: key === 'ANIVERSARIO' ? 50 : 0,
    openBarTime: key === 'VIP' ? 'Após o encerramento do Open Bar' : '',
    acceptsCake: key === 'ANIVERSARIO',
    skyConditions: '',
    birthdayRule: '',
  }))
}

const pricedFormKeys = new Set<FormKey>(['DJS', 'INFLUENCIADORES', 'LISTA_LOVERS'])
const consumptionFormKeys = pricedFormKeys

export function copyFormSettings(source: FormConfig, target: FormConfig): FormConfig {
  const copied: FormConfig = {
    ...target,
    openAt: source.openAt,
    start: source.start,
    end: source.end,
    cutoff: source.cutoff,
    extra: source.extra,
    publicText: source.publicText,
    requiredFields: { ...requiredFieldsFor(source) },
  }

  if (pricedFormKeys.has(source.key) && pricedFormKeys.has(target.key)) copied.price = source.price
  if (consumptionFormKeys.has(source.key) && consumptionFormKeys.has(target.key)) copied.consumption = source.consumption

  return copied
}

export function linkPeopleToEvent(
  people: Person[],
  selectedIds: string[],
  eventId: string,
  detailsByPerson: Record<string, EventDetails>,
): Person[] {
  const selected = new Set(selectedIds)
  return people.map((person) => {
    if (!selected.has(person.id) || !person.active) return person

    return {
      ...person,
      eventIds: [...new Set([...(person.eventIds ?? []), eventId])],
      eventDetails: {
        ...(person.eventDetails ?? {}),
        [eventId]: detailsByPerson[person.id] ?? { track: '', time: '', order: 1 },
      },
    }
  })
}

export function publicProfessionalsForEvent(people: PublicPerson[], kind: Person['kind'], eventId: string) {
  return people.filter((person) => person.kind === kind && person.eventIds.includes(eventId))
}

export function csvDownload(name: string, rows: (string | number)[][]) {
  const escape = (value: string | number) =>
    `"${String(value ?? '').replace(/"/g, '""')}"`
  const content = '\uFEFF' + rows.map((row) => row.map(escape).join(';')).join('\r\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}
