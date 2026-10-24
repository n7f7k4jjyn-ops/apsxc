import { RostersPage } from './rosters'
import { FinancePage } from './finance'
import { useAuthStore } from '@/stores/auth-store'
import { InfluencerPayoutReportPanel } from './influencer-payout-report-panel'
import { birthdayDoorGroup, birthdayGuestNames } from './birthday-guests'
import { professionalDoorList } from './professional-door-list'
import { djLineRows, djLineSections, djGuests } from './dj-line'
import { DjLineEditor } from './dj-line-editor'
import type { PortariaSection } from './portaria-pdf'
import { RegistryPage } from './registry'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AtSign,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Heart,
  Headphones,
  ListFilter,
  Megaphone,
  Music2,
  Plus,
  Printer,
  Search,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search as GlobalSearch } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ConfigDrawer } from '@/components/config-drawer'
import { ProfileDropdown } from '@/components/profile-dropdown'
import {
  eventById,
  FORM_DEFS,
  formTitle,
  isOpen,
  makeConfigs,
  makeEvent,
  money,
  openingDateFor,
  requiredFieldsFor,
  sortRows,
  visibleRegistrations,
  type SortDirection,
  weekday,
  csvDownload,
  copyFormSettings,
  linkPeopleToEvent,
  type EventDetails,
  type FormConfig,
  type FormKey,
  type Person,
  type VerdantEvent,
  type VerdantState,
} from './data'
import { useVerdantStore } from './store'
import { readCustomerImport, type ImportedCustomer } from './customer-import'
import { readHistoricalRegistrationImport, type HistoricalRegistrationImport } from './historical-registration-import'
import './verdant.css'
import { getCurrentLanguage, LocalizedText, useLanguage } from '@/context/language-provider'
import { getCalendarDays } from './calendar-utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Section = 'financeiro' | 'escalas' | 'cadastros' | 'agenda' | 'formularios' | 'listas' | 'respostas' | 'clientes' | 'djs' | 'influencers' | 'exportacoes' | 'configuracoes'

const slugByForm: Record<FormKey, string> = {
  DJS: 'djs',
  INFLUENCIADORES: 'influencers',
  LISTA_LOVERS: 'lovers',
  VIP: 'vip',
  ANIVERSARIO: 'aniversario',
  ENTRADA_GRATUITA: 'entrada-gratuita',
}

const sectionInfo: Record<Section, { title: string; description: string }> = {
  financeiro: { title: 'Financeiro', description: 'Contas a pagar e receber, caixa e pagamentos de equipe e DJs.' },
  escalas: {title:'Escalas',description:'Equipe, postos e jornadas por data.'},
  cadastros: { title: 'Cadastros', description: 'Pessoas, contatos e histórico da operação.' },
  agenda: { title: 'Agenda de eventos', description: 'Cadastre qualquer data, inclusive feriados, e configure suas listas por evento.' },
  formularios: { title: 'Formulários públicos', description: 'Cada lista tem seu link fixo; novas datas entram como opções no mesmo formulário.' },
  listas: { title: 'Listas', description: 'Visualize e filtre todas as listas por evento, data e situação.' },
  respostas: { title: 'Respostas dos formulários', description: 'Consulte todas as respostas em ordem alfabética e filtre por evento ou lista.' },
  clientes: { title: 'Clientes', description: 'Consulte as inscrições dos formulários e importe a base histórica de clientes para cruzamentos futuros.' },
  djs: { title: 'Cadastro de DJs', description: 'Mantenha o cadastro geral e escolha, em cada evento, quem aparece na lista.' },
  influencers: { title: 'Cadastro de Influencers', description: 'Mantenha o cadastro geral e vincule cada pessoa às datas em que participará.' },
  exportacoes: { title: 'Exportações', description: 'Prepare a lista de portaria, leads e relatórios de profissionais.' },
  configuracoes: { title: 'Configurações', description: 'Ajuste a operação dos formulários e confira a sincronização.' },
}

const isoDate = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const compactDate = (date: string) => {
  if (!date) return getCurrentLanguage() === 'en' ? 'Date to be set' : 'Data a definir'
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

function formLink(key: FormKey) {
  return `${window.location.origin}/lista/${slugByForm[key]}`
}

function copyText(value: string) {
  if (!navigator.clipboard) {
    toast.error('Copie o endereço exibido na tela.')
    return
  }
  void navigator.clipboard.writeText(value).then(
    () => toast.success('Link copiado.'),
    () => toast.error('Não foi possível copiar o link.')
  )
}

function SectionHeading({ section, action }: { section: Section; action?: React.ReactNode }) {
  const { translate } = useLanguage()
  const info = sectionInfo[section]
  return (
    <div className='verdant-page-heading'>
      <div>
        <div className='verdant-eyebrow'>{<LocalizedText text={"CENTRAL VERDANT"} />}</div>
        <h1>{translate(info.title)}</h1>
        <p>{translate(info.description)}</p>
      </div>
      {action && <div className='verdant-page-action'>{action}</div>}
    </div>
  )
}

function StatusPill({ open, enabled }: { open: boolean; enabled: boolean }) {
  const { translate } = useLanguage()
  const label = open ? 'Inscrições abertas' : enabled ? 'Fora do prazo' : 'Desativado'
  return <span className={`verdant-status ${open ? 'is-open' : enabled ? 'is-scheduled' : ''}`}>{translate(label)}</span>
}

type ColumnFilterOption = { value: string; label: string }

function ColumnFilterControl({
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  options?: ColumnFilterOption[]
}) {
  const { translate } = useLanguage()
  const [open, setOpen] = useState(false)
  return <div className='verdant-column-filter'>
    <button type='button' className={`verdant-column-filter-trigger ${value ? 'active' : ''}`} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <ListFilter size={14} /><LocalizedText text={label} />{value && <span className='verdant-filter-dot' />}
    </button>
    {open && <div className='verdant-column-filter-input'>
      {options
        ? <select aria-label={`${translate('Filtrar')}: ${translate(label)}`} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value || 'all'} value={option.value}>{translate(option.label)}</option>)}</select>
        : <input type='search' aria-label={`${translate('Filtrar')}: ${translate(label)}`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={translate(placeholder || `Filtrar ${label.toLowerCase()}`)} />}
      {value && <button type='button' className='verdant-column-filter-clear' onClick={() => onChange('')}>{<LocalizedText text='Limpar' />}</button>}
    </div>}
  </div>
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: ReactNode
  active: boolean
  direction: SortDirection
  onClick: () => void
}) {
  return <button type='button' className='verdant-sort-header' onClick={onClick}>
    <span>{label}</span>
    <span className='verdant-sort-indicator' aria-hidden='true'>{active ? direction === 'asc' ? '↑' : '↓' : '↕'}</span>
  </button>
}

function SortableTableHeader({ label, active, direction, onClick }: {
  label: ReactNode
  active: boolean
  direction: SortDirection
  onClick: () => void
}) {
  return <th aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortButton label={label} active={active} direction={direction} onClick={onClick} /></th>
}

function DashboardLinkCard() {
  const { language } = useLanguage()
  const data = useVerdantStore((s) => s.data)
  const initialize = useVerdantStore((s) => s.initialize)
  const count = visibleRegistrations(data).length
  const opened = data.forms.filter((form) => isOpen(data, form.key, form.eventId)).length
  useEffect(() => { void initialize() }, [initialize])
  return (
    <Card className='verdant-shortcut-card'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <CardTitle className='text-base'>{<LocalizedText text={"Operação de listas Verdant"} />}</CardTitle>
            <CardDescription className='mt-1'>{<LocalizedText text={"Agenda e formulários públicos"} />}</CardDescription>
          </div>
          <div className='verdant-shortcut-mark'><ClipboardList size={19} /></div>
        </div>
      </CardHeader>
      <CardContent className='flex flex-wrap items-center gap-3'>
        <span className='verdant-stat-inline'>{data.events.filter((event) => event.active).length} {language === 'en' ? 'active events' : 'eventos ativos'}</span>
        <span className='verdant-stat-inline'>{opened} {language === 'en' ? 'open options' : 'opções abertas'}</span>
        <span className='verdant-stat-inline'>{count} {language === 'en' ? 'registrations' : 'inscrições'}</span>
        <Button asChild size='sm' className='verdant-report-primary ms-auto'>
          <Link to='/verdant/agenda'>{<LocalizedText text={"Abrir operação"} trailingSpace />}<ArrowRight size={15} /></Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function VerdantWorkspace({ sectionName }: { sectionName?: string }) {
  const { translate } = useLanguage()
  const data = useVerdantStore((s) => s.data)
  const ready = useVerdantStore((s) => s.ready)
  const serverConnected = useVerdantStore((s) => s.serverConnected)
  const initialize = useVerdantStore((s) => s.initialize)
  const update = useVerdantStore((s) => s.update)
  const section = (sectionName && sectionName in sectionInfo ? sectionName : 'agenda') as Section

  useEffect(() => { void initialize() }, [initialize])

  return (
    <>
      <Header fixed className='verdant-workspace-header bg-background/95 backdrop-blur'>
        <div className='min-w-0 flex-1'>
          <GlobalSearch />
        </div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <ThemeSwitch />
          <div className='hidden sm:block'><ConfigDrawer /></div>
          <ProfileDropdown />
        </div>
      </Header>
      <Main className='verdant-main'>
        <div className='mb-3'>
          <Button asChild variant='ghost' size='sm'>
            <Link to='/'><ArrowLeft size={15} /><LocalizedText text='Voltar ao resumo' /></Link>
          </Button>
        </div>
        <div className='verdant-workspace-status'>
          <span className={`verdant-dot ${serverConnected ? 'connected' : ''}`} />
          {translate(serverConnected ? 'Sincronização com servidor ativa' : 'Servidor desconectado · alterações indisponíveis')}
          {!ready && <span className='ms-2'>{<LocalizedText text={"· carregando"} />}</span>}
        </div>
        {section === 'escalas' && <RostersPage data={data} />}
        {section === 'financeiro' && <FinancePage />}
        {section === 'agenda' && <AgendaPage data={data} update={update} />}
        {section === 'formularios' && <FormsPage data={data} update={update} />}
        {section === 'listas' && <ListsPage data={data} update={update} />}
        {section === 'respostas' && <RegistrationsPage data={data} update={update} serverConnected={serverConnected} standalone />}
        {['cadastros','clientes','djs','influencers'].includes(section) && <RegistryPage key={section} initialCategory={section === 'djs' ? 'djs' : section === 'influencers' ? 'influencers' : 'clients'} data={data} renderPeople={kind => <PeoplePage key={kind} kind={kind} data={data} update={update} />} tools={<RegistrationsPage data={data} update={update} serverConnected={serverConnected} />} />}
        {section === 'exportacoes' && <ExportsPage data={data} />}
        {section === 'configuracoes' && <SettingsPage data={data} />}
      </Main>
    </>
  )
}

export function DashboardVerdantShortcut() {
  return <div className='mt-6'><DashboardLinkCard /></div>
}

function AgendaPage({ data, update }: { data: VerdantState; update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean> }) {
  const { language, translate } = useLanguage()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newDate, setNewDate] = useState('')
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => isoDate(new Date()))
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  const [notice, setNotice] = useState('')
  const [draftConfigs, setDraftConfigs] = useState<FormConfig[]>([])
  const [draftProfessionalIds, setDraftProfessionalIds] = useState<string[]>([])
  const [selectedEventProfessionalIds, setSelectedEventProfessionalIds] = useState<string[]>([])
  const [draftProfessionalDetails, setDraftProfessionalDetails] = useState<Record<string, EventDetails>>({})
  const [copiedFormKeys, setCopiedFormKeys] = useState<FormKey[]>([])
  const selected = data.events.find((event) => event.id === selectedId)
  const draftDate = selected?.date ?? newDate
  const creatingEvent = !selected && !!draftDate
  const calendarDays = getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth())
  const calendarLocale = language === 'en' ? 'en-US' : 'pt-BR'
  const calendarMonthLabel = new Intl.DateTimeFormat(calendarLocale, { month: 'long', year: 'numeric' }).format(calendarMonth)
  const calendarWeekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(calendarLocale, { weekday: 'short' }).format(new Date(2024, 0, index + 1)).replace('.', '')
  )
  const selectedDateEvents = data.events
    .filter((event) => event.date === selectedCalendarDate)
    .sort((a, b) => a.name.localeCompare(b.name, calendarLocale, { sensitivity: 'base' }))
  const eventCountsByDate = data.events.reduce<Record<string, number>>((counts, event) => {
    counts[event.date] = (counts[event.date] ?? 0) + 1
    return counts
  }, {})

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const updateViewport = () => setIsMobile(media.matches)
    updateViewport()
    media.addEventListener('change', updateViewport)
    return () => media.removeEventListener('change', updateViewport)
  }, [])

  useEffect(() => {
    if (!isMobile || (!selected && !draftDate)) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [draftDate, isMobile, selected])

  useEffect(() => {
    if (!isMobile || (!selected && !draftDate)) return
    const closeOnEscape = (event: KeyboardEvent) => {
      const pickerOpen = document.querySelector('.verdant-professional-popover[data-state="open"]')
      if (event.key === 'Escape' && !pickerOpen) {
        setSelectedId(null)
        setNewDate('')
      }
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [draftDate, isMobile, selected])

  function startNewEvent(date: string) {
    setNotice('')
    setSelectedId(null)
    setNewDate(date)
    setSelectedCalendarDate(date)
    const [year, month] = date.split('-').map(Number)
    setCalendarMonth(new Date(year, month - 1, 1))
    setDraftConfigs(makeConfigs(makeEvent(date, '')))
    setDraftProfessionalIds([])
    setDraftProfessionalDetails({})
    setCopiedFormKeys([])
  }

  function changeNewEventDate(date: string) {
    const previousDefaultOpenAt = newDate ? openingDateFor(newDate) : ''
    setNewDate(date)
    setDraftConfigs((current) => current.map((config) => config.openAt === previousDefaultOpenAt
      ? { ...config, openAt: openingDateFor(date) }
      : config))
  }

  function updateDraftConfig(key: FormKey, next: FormConfig) {
    setDraftConfigs((current) => current.map((config) => config.key === key ? next : config))
  }

  function copyPreviousFormSettings(key: FormKey, checked: boolean) {
    setCopiedFormKeys((current) => checked
      ? [...new Set([...current, key])]
      : current.filter((item) => item !== key))
    if (!checked) return

    const index = FORM_DEFS.findIndex((definition) => definition.key === key)
    const previousKey = FORM_DEFS[index - 1]?.key
    if (!previousKey) return
    setDraftConfigs((current) => {
      const previous = current.find((config) => config.key === previousKey)
      if (!previous) return current
      return current.map((config) => config.key === key ? copyFormSettings(previous, config) : config)
    })
  }

  function toggleDraftProfessional(person: Person, checked: boolean) {
    const nextIds = checked
      ? [...new Set([...draftProfessionalIds, person.id])]
      : draftProfessionalIds.filter((id) => id !== person.id)
    setDraftProfessionalIds(nextIds)
    if (checked) {
      const order = nextIds.filter((id) => data.people.find((item) => item.id === id)?.kind === person.kind).length
      setDraftProfessionalDetails((current) => ({
        ...current,
        [person.id]: current[person.id] ?? { track: '', time: '', order },
      }))
    }
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    const values = new FormData(event.currentTarget)
    const name = String(values.get('name') ?? '').trim()
    const date = String(values.get('date') ?? '')
    const eventTime = String(values.get('eventTime') ?? '')
    const entryValue = String(values.get('entryValue') ?? '')
    const linkedListKeys = new Set(values.getAll('linkedList').map((value) => String(value) as FormKey))
    const linkedProfessionalIds = new Set(selectedEventProfessionalIds)
    if (!name || !date) return
      const enabledForms = selected
        ? data.forms.filter((config) => config.eventId === selected.id && linkedListKeys.has(config.key))
        : draftConfigs.filter((config) => config.enabled)
      const selectedPeople = selected ? linkedProfessionalIds : new Set(draftProfessionalIds)
      const missingRoster = enabledForms.find((config) => {
        const kind = config.key === 'DJS' ? 'DJ' : config.key === 'INFLUENCIADORES' ? 'INFLUENCIADORES' : null
        return kind && !data.people.some((person) => selectedPeople.has(person.id) && person.kind === kind && person.active)
      })
      if (missingRoster) {
        const professional = missingRoster.key === 'DJS' ? 'DJ' : 'Influencer'
        toast.error(language === 'en' ? `Select at least one active ${professional} before enabling this form.` : `Selecione ao menos um ${professional} ativo antes de habilitar este formulário.`)
        return
    }
    let item: VerdantEvent | undefined
    let saved: boolean
    if (selected) {
      saved = await update((state) => ({
        ...state,
        events: state.events.map((item) => item.id === selected.id ? { ...item, name, date, eventTime, entryValue } : item),
        forms: state.forms.map((form) => {
          if (form.eventId !== selected.id) return form
          const next = form.openAt === openingDateFor(selected.date) ? { ...form, openAt: openingDateFor(date) } : form
          return { ...next, enabled: linkedListKeys.has(form.key) }
        }),
        people: state.people.map((person) => {
          if (!person.active) return person
          const isLinked = linkedProfessionalIds.has(person.id)
          const eventIds = isLinked
            ? [...new Set([...(person.eventIds ?? []), selected.id])]
            : (person.eventIds ?? []).filter((id) => id !== selected.id)
          const eventDetails = { ...(person.eventDetails ?? {}) }
          if (isLinked) eventDetails[selected.id] ??= { track: '', time: '', order: state.people.filter((item) => item.id !== person.id && item.kind === person.kind && item.active && linkedProfessionalIds.has(item.id)).length + 1 }
          else delete eventDetails[selected.id]
          return { ...person, eventIds, eventDetails }
        }),
      }))
    } else {
      const newItem = makeEvent(date, name)
      newItem.eventTime = eventTime
      newItem.entryValue = entryValue
      item = newItem
      const configs = draftConfigs.map((config) => ({ ...config, id: `${config.key}-${newItem.id}`, eventId: newItem.id }))
      const selectedPeople = new Set(draftProfessionalIds)
      saved = await update((state) => ({
        ...state,
        events: [...state.events, newItem],
        forms: [...state.forms, ...configs],
        people: linkPeopleToEvent(state.people, [...selectedPeople], newItem.id, draftProfessionalDetails),
      }))
    }
    if (!saved) return
    if (item) {
      setSelectedId(item.id)
      setSelectedEventProfessionalIds(draftProfessionalIds)
      setNewDate('')
      setDraftConfigs([])
      setDraftProfessionalIds([])
      setDraftProfessionalDetails({})
      setCopiedFormKeys([])
    }
    toast.success(selected ? 'Evento atualizado.' : 'Evento criado.', { duration: 10000 })
  }

  async function archiveSelected() {
    if (!selected) return
    setNotice('')
    const archived = await update((state) => ({ ...state, events: state.events.map((item) => item.id === selected.id ? { ...item, active: !item.active } : item) }))
    if (archived) toast.success(selected.active ? 'Evento arquivado.' : 'Evento reativado.', { duration: 10000 })
  }

  async function deleteSelected() {
    if (!selected) return
    const count = data.registrations.filter((row) => row.eventId === selected.id).length
    if (!window.confirm(`Excluir definitivamente o evento "${selected.name}", suas listas e ${count} inscrição(ões)? Esta ação não pode ser desfeita.`)) return
    setNotice('')
    const removedId = selected.id
    const deleted = await update((state) => ({
      ...state,
      events: state.events.filter((item) => item.id !== removedId),
      forms: state.forms.filter((form) => form.eventId !== removedId),
      registrations: state.registrations.filter((row) => row.eventId !== removedId),
      people: state.people.map((person) => {
        const details = person.eventDetails ?? {}
        if (!person.eventIds.includes(removedId) && !(removedId in details)) return person
        const { [removedId]: _removed, ...eventDetails } = details
        return { ...person, eventIds: person.eventIds.filter((id) => id !== removedId), eventDetails }
      }),
    }))
    if (!deleted) return
    setSelectedId(null)
    toast.success('Evento excluído.', { duration: 10000 })
  }

  function closeEventEditor() {
    setSelectedId(null)
    setNewDate('')
  }

  return (
    <>
      <SectionHeading section='agenda' />
      {notice && <div role='status' aria-live='polite' className='verdant-flash'>{notice}</div>}
      <div className='verdant-calendar-layout'>
        <Card className='verdant-calendar-card'>
          <CardHeader className='verdant-calendar-header'>
            <div>
              <CardTitle><LocalizedText text='Agenda de eventos' /></CardTitle>
              <CardDescription><LocalizedText text='Escolha uma data para ver os eventos ou criar um novo.' /></CardDescription>
            </div>
            <Button onClick={() => { setNotice(''); startNewEvent(isoDate(new Date())) }}><Plus size={16} /><LocalizedText text='Novo evento' leadingSpace /></Button>
          </CardHeader>
          <CardContent>
            <div className='verdant-calendar-month-nav'>
              <Button type='button' variant='ghost' size='icon' aria-label={translate('Mês anterior')} onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></Button>
              <h2 className='capitalize'>{calendarMonthLabel}</h2>
              <Button type='button' variant='ghost' size='icon' aria-label={translate('Próximo mês')} onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></Button>
            </div>
            <div className='verdant-calendar-grid' role='grid' aria-label={translate('Agenda mensal')}>
              {calendarWeekdays.map((day, index) => <div className='verdant-calendar-weekday' role='columnheader' key={`${day}-${index}`}>{day}</div>)}
              {calendarDays.map((day, index) => {
                if (day === null) return <div className='verdant-calendar-day is-empty' role='gridcell' aria-hidden='true' key={`empty-${index}`} />
                const date = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day))
                const count = eventCountsByDate[date] ?? 0
                const selectedDate = selectedCalendarDate === date
                return <button
                  type='button'
                  role='gridcell'
                  aria-pressed={selectedDate}
                  aria-label={`${day}, ${calendarMonthLabel}${count ? `, ${count} ${translate(count === 1 ? 'evento' : 'eventos')}` : ''}`}
                  className={`verdant-calendar-day ${selectedDate ? 'is-selected' : ''} ${count ? 'has-events' : ''}`}
                  key={date}
                  onClick={() => setSelectedCalendarDate(date)}
                >
                  <span>{day}</span>
                  {count > 0 && <span className='verdant-calendar-day-count'>{count}</span>}
                </button>
              })}
            </div>
            <section className='verdant-calendar-day-events' aria-live='polite'>
              <div className='verdant-calendar-day-heading'>
                <div><b>{new Intl.DateTimeFormat(calendarLocale, { dateStyle: 'full' }).format(new Date(`${selectedCalendarDate}T12:00:00`))}</b><span>{selectedDateEvents.length} <LocalizedText text={selectedDateEvents.length === 1 ? 'evento' : 'eventos'} /></span></div>
                <Button type='button' size='sm' variant='outline' onClick={() => { setNotice(''); startNewEvent(selectedCalendarDate) }}><Plus size={14} /><LocalizedText text='Novo evento' leadingSpace /></Button>
              </div>
              {selectedDateEvents.map((event) => {
                const opened = data.forms.filter((form) => form.eventId === event.id && isOpen(data, form.key, event.id)).length
    const count = visibleRegistrations(data).filter((row) => row.eventId === event.id).length
                return <button type='button' className='verdant-calendar-event' key={event.id} onClick={() => {
                  setSelectedCalendarDate(event.date)
                  setSelectedId(event.id)
                  setSelectedEventProfessionalIds(data.people.filter((person) => person.eventIds.includes(event.id)).map((person) => person.id))
                  setNewDate('')
                }}>
                  <span className={`verdant-calendar-event-dot ${opened > 0 ? 'is-open' : event.date < isoDate(new Date()) ? 'is-closed' : event.active ? 'is-upcoming' : ''}`} />
                  <span className='verdant-calendar-event-name'>{event.name}</span>
                  <span className='verdant-calendar-event-meta'>{event.eventTime || '—'} · {opened} {language === 'en' ? 'open' : 'abertas'} · {count}</span>
                  <ChevronRight size={16} aria-hidden='true' />
                </button>
              })}
              {!selectedDateEvents.length && <p className='verdant-calendar-empty'><CalendarDays size={18} /><LocalizedText text='Nenhum evento nesta data. Você pode criar um agora.' /></p>}
            </section>
          </CardContent>
        </Card>

        <div
          className={`verdant-event-editor-shell ${isMobile ? `mobile ${selected || draftDate ? 'open' : ''}` : ''}`}
          role={isMobile && (selected || draftDate) ? 'dialog' : undefined}
          aria-modal={isMobile && (selected || draftDate) ? true : undefined}
          aria-label={isMobile && (selected || draftDate) ? translate(selected ? 'Editar evento' : 'Novo evento') : undefined}
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeEventEditor() }}
        >
        <Card className='verdant-event-editor'>
          <CardHeader>
            <div className='verdant-event-editor-heading'>
              <div>
                <CardTitle>{selected ? 'Editar evento' : draftDate ? 'Novo evento' : 'Selecione um evento'}</CardTitle>
                <CardDescription>{selected ? 'Alterar a data não apaga inscrições ou vínculos.' : <LocalizedText text={"Configure as listas e os profissionais desta data antes de criar o evento."} />}</CardDescription>
              </div>
              <Button type='button' variant='outline' onClick={closeEventEditor}><ArrowLeft size={15} /><LocalizedText text={creatingEvent ? 'Voltar ao calendário' : 'Fechar'} leadingSpace /></Button>
            </div>
          </CardHeader>
          <CardContent>
            {selected || draftDate ? (
              <form className='verdant-form-stack' onSubmit={saveEvent} onChange={() => setNotice('')} key={selected?.id ?? 'new'}>
                <label className='verdant-field'>{<LocalizedText text={"Nome do evento"} />}<input name='name' required maxLength={120} defaultValue={selected?.name ?? ''} placeholder='Nome da festa' /></label>
                <label className='verdant-field'>{<LocalizedText text={"Data"} />}<input name='date' type='date' required value={draftDate} onChange={(event) => !selected && changeNewEventDate(event.target.value)} /></label>
                <label className='verdant-field'>{<LocalizedText text={"Horário do evento"} />}<input name='eventTime' type='time' defaultValue={selected?.eventTime ?? ''} /></label>
                <label className='verdant-field'>{<LocalizedText text={"Valor de entrada do evento"} />}<input name='entryValue' type='number' min='0' step='0.01' defaultValue={selected?.entryValue ?? ''} placeholder='A informar' /><small className='text-muted-foreground'>O valor mostrado na lista pública é configurado separadamente em Formulários.</small></label>
                {selected ? <>
                  <fieldset className='verdant-event-list-selection'>
                  <legend>{<LocalizedText text={"Listas vinculadas ao evento"} />}</legend>
                  <p>{<LocalizedText text={"Marque quais formulários públicos devem oferecer este evento. Você pode alterar as regras de cada lista em Formulários."} />}</p>
                  <div className='verdant-event-list-options'>
                    {FORM_DEFS.map((form) => {
                      const config = data.forms.find((item) => item.eventId === selected.id && item.key === form.key)
                      return <label key={form.key} className='verdant-event-list-option'><input type='checkbox' name='linkedList' value={form.key} defaultChecked={config?.enabled ?? false} /><span><LocalizedText text={form.title} /></span></label>
                    })}
                  </div>
                  </fieldset>
                  <EventPeopleSelector
                    people={data.people}
                    selectedIds={selectedEventProfessionalIds}
                    onChange={setSelectedEventProfessionalIds}
                  />
                </> : <section className='verdant-event-form-configs'>
                  <div className='verdant-event-form-configs-heading'><div><h3>{<LocalizedText text={"Configuração das listas deste evento"} />}</h3><p>{<LocalizedText text={"Todas as regras e vínculos serão gravados junto com o evento."} />}</p></div><span>{<LocalizedText text={"5 formulários"} />}</span></div>
                  {FORM_DEFS.map((definition, index) => {
                    const config = draftConfigs.find((item) => item.key === definition.key)
                    if (!config) return null
                    const previousConfig = index > 0 ? draftConfigs.find((item) => item.key === FORM_DEFS[index - 1].key) : undefined
                    return <EventFormConfigDraftCard
                      key={definition.key}
                      definition={definition}
                      config={config}
                      eventDate={draftDate}
                      copySettingsChecked={copiedFormKeys.includes(definition.key)}
                      hasPreviousConfig={!!previousConfig}
                      onCopySettingsChange={(checked) => copyPreviousFormSettings(definition.key, checked)}
                      people={data.people}
                      selectedProfessionalIds={draftProfessionalIds}
                      professionalDetails={draftProfessionalDetails}
                      onConfigChange={(next) => updateDraftConfig(definition.key, next)}
                      onProfessionalToggle={toggleDraftProfessional}
                      onProfessionalDetailsChange={(id, details) => setDraftProfessionalDetails((current) => ({ ...current, [id]: details }))}
                    />
                  })}
                </section>}
                {selected && <div className='verdant-editor-summary'><div><b>{data.forms.filter((form) => form.eventId === selected.id && form.enabled).length}</b><span>{<LocalizedText text={"listas habilitadas"} />}</span></div><div><b>{visibleRegistrations(data).filter((row) => row.eventId === selected.id).length}</b><span>{<LocalizedText text={"inscrições"} />}</span></div></div>}
                <Button type='submit'>{selected ? 'Salvar evento' : 'Criar evento'}</Button>
                {selected && <Button type='button' variant='outline' onClick={archiveSelected}><Archive size={15} />{selected.active ? 'Arquivar evento' : 'Reativar evento'}</Button>}
                {selected && <Button type='button' variant='destructive' onClick={deleteSelected}><Trash2 size={15} />Excluir evento</Button>}
              </form>
            ) : (
              <div className='verdant-empty-state'><CalendarDays size={26} /><p>{<LocalizedText text={"Escolha uma data no calendário ou crie um evento."} />}</p></div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  )
}

function EventPeopleSelector({
  people,
  selectedIds,
  onChange,
}: {
  people: Person[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className='verdant-event-list-selection'>
      <legend><LocalizedText text='DJs e Influencers desta data' /></legend>
      <p><LocalizedText text='Escolha os profissionais ativos que devem aparecer nas listas deste evento.' /></p>
      <EventPeopleCategorySelector kind='DJ' people={people} selectedIds={selectedIds} onChange={onChange} />
      <EventPeopleCategorySelector kind='INFLUENCER' people={people} selectedIds={selectedIds} onChange={onChange} />
    </fieldset>
  )
}

function EventPeopleCategorySelector({
  kind,
  people,
  selectedIds,
  onChange,
}: {
  kind: 'DJ' | 'INFLUENCER'
  people: Person[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const { translate } = useLanguage()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const label = kind === 'DJ' ? 'DJs' : 'Influencers'
  const categoryPeople = people
    .filter((person) => person.active && (person.kind === 'DJ' ? 'DJ' : 'INFLUENCER') === kind)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
  const filteredPeople = categoryPeople.filter((person) =>
    person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )
  const selectedPeople = categoryPeople.filter((person) => selectedIds.includes(person.id))

  function togglePerson(person: Person, checked: boolean) {
    onChange(checked
      ? [...new Set([...selectedIds, person.id])]
      : selectedIds.filter((id) => id !== person.id))
  }

  return (
    <div className='mt-3 grid gap-1'>
      <b className='text-sm'><LocalizedText text={label} /></b>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type='button' variant='outline' className='verdant-professional-select'>
            <Headphones size={15} />
            <span>{selectedPeople.length
              ? `${selectedPeople.length} ${translate(kind === 'DJ' ? 'DJs selecionados' : 'Influencers selecionados')}`
              : translate(kind === 'DJ' ? 'Selecionar DJs' : 'Selecionar Influencers')}</span>
            <ChevronDown size={15} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='verdant-professional-popover !z-[100]'>
          <label className='verdant-professional-search'>
            <Search size={15} aria-hidden='true' />
            <input type='search' value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translate('Buscar profissional')} aria-label={translate('Buscar profissional')} />
          </label>
          <div className='verdant-professional-options'>
            {filteredPeople.map((person) => (
              <label className='verdant-event-list-option' key={person.id}>
                <input type='checkbox' checked={selectedIds.includes(person.id)} onChange={(event) => togglePerson(person, event.target.checked)} />
                <span>{person.name}</span>
              </label>
            ))}
            {!filteredPeople.length && <p className='verdant-professional-empty'><LocalizedText text={categoryPeople.length ? 'Nenhum profissional encontrado.' : 'Nenhum profissional ativo cadastrado.'} /></p>}
          </div>
        </PopoverContent>
      </Popover>
      <small className='text-muted-foreground'>{selectedPeople.length
        ? selectedPeople.map((person) => person.name).join(', ')
        : translate('Nenhum profissional selecionado')}</small>
    </div>
  )
}

function EventFormConfigDraftCard({
  definition,
  config,
  eventDate,
  copySettingsChecked,
  hasPreviousConfig,
  onCopySettingsChange,
  people,
  selectedProfessionalIds,
  professionalDetails,
  onConfigChange,
  onProfessionalToggle,
  onProfessionalDetailsChange,
}: {
  definition: (typeof FORM_DEFS)[number]
  config: FormConfig
  eventDate: string
  copySettingsChecked: boolean
  hasPreviousConfig: boolean
  onCopySettingsChange: (checked: boolean) => void
  people: Person[]
  selectedProfessionalIds: string[]
  professionalDetails: Record<string, EventDetails>
  onConfigChange: (config: FormConfig) => void
  onProfessionalToggle: (person: Person, checked: boolean) => void
  onProfessionalDetailsChange: (id: string, details: EventDetails) => void
}) {
  const { translate } = useLanguage()
  const professionalKind = config.key === 'DJS' ? 'DJ' : config.key === 'INFLUENCIADORES' ? 'INFLUENCIADORES' : null
  const availablePeople = professionalKind
    ? people.filter((person) => person.kind === professionalKind && person.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
    : []
  const linkedCount = availablePeople.filter((person) => selectedProfessionalIds.includes(person.id)).length
  const requiredFields = requiredFieldsFor(config)
  const [professionalsDialogOpen, setProfessionalsDialogOpen] = useState(false)
  const [professionalQuery, setProfessionalQuery] = useState('')

  return (
    <details className='verdant-config-card verdant-create-config-card'>
      <summary>
        <div className='verdant-config-event'><b><LocalizedText text={definition.title} /></b><span>{weekday(eventDate)} · {compactDate(eventDate)}</span></div>
        <div className='verdant-create-config-summary'>
          {professionalKind && <span className='verdant-create-config-count'>{linkedCount} <LocalizedText text={professionalKind === 'DJ' ? 'DJs selecionados' : 'Influencers selecionados'} /></span>}
          <span className={`verdant-status ${config.enabled ? 'is-open' : ''}`}><LocalizedText text={config.enabled ? 'Incluída' : 'Desativada'} /></span>
          <ChevronDown className='verdant-create-config-chevron' size={16} aria-hidden='true' />
        </div>
      </summary>
      <div className='verdant-config-form'>
        {hasPreviousConfig && <div className='verdant-copy-form-settings'>
          <label className='verdant-switch-line'><input type='checkbox' checked={copySettingsChecked} onChange={(event) => onCopySettingsChange(event.target.checked)} /><span><LocalizedText text='Copiar configurações do formulário anterior' /></span></label>
          <small><LocalizedText text='A cópia acontece uma vez; depois, esta lista pode ser editada de forma independente.' /></small>
        </div>}
        <label className='verdant-switch-line'><input type='checkbox' checked={config.enabled} onChange={(event) => onConfigChange({ ...config, enabled: event.target.checked })} /><span>{<LocalizedText text={"Incluir esta data como opção no formulário"} />}</span></label>
        {professionalKind && <div className='verdant-create-professionals'>
          <div className='verdant-create-professionals-heading'>
            <div><b><LocalizedText text={professionalKind === 'DJ' ? 'DJs desta data' : 'Influencers desta data'} /></b><small>{linkedCount} <LocalizedText text={"profissionais selecionados para esta data"} /> · <LocalizedText text={"A equipe decide quem participa de cada evento."} /></small></div>
            <Popover open={professionalsDialogOpen} onOpenChange={setProfessionalsDialogOpen}>
              <PopoverTrigger asChild>
                <Button type='button' variant='outline' disabled={!availablePeople.length} className='verdant-professional-select'>
                  <Headphones size={15} />
                  <span>{linkedCount ? `${linkedCount} ${translate(professionalKind === 'DJ' ? 'DJs selecionados' : 'Influencers selecionados')}` : translate(professionalKind === 'DJ' ? 'Selecionar DJs' : 'Selecionar Influencers')}</span>
                  <ChevronDown size={15} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align='start' className='verdant-professional-popover !z-[100]'>
                <label className='verdant-professional-search'>
                  <Search size={15} aria-hidden='true' />
                  <input autoFocus type='search' value={professionalQuery} onChange={(event) => setProfessionalQuery(event.target.value)} placeholder={translate('Buscar profissional')} aria-label={translate('Buscar profissional')} />
                </label>
                <div className='verdant-professional-options'>
                  {availablePeople
                    .filter((person) => person.name.toLocaleLowerCase().includes(professionalQuery.trim().toLocaleLowerCase()))
                    .map((person) => {
                      const checked = selectedProfessionalIds.includes(person.id)
                      const details = professionalDetails[person.id] ?? { track: '', time: '', order: 1 }
                      return <div className={`verdant-professional-option ${checked ? 'selected' : ''}`} key={person.id}>
                        <label className='verdant-link-check'><input type='checkbox' checked={checked} onChange={(event) => onProfessionalToggle(person, event.target.checked)} /><span><b>{person.name}</b><small>{person.phone || person.instagram || 'Cadastro ativo'}</small></span></label>
                        {checked && <div className='verdant-link-fields'>
                          {professionalKind === 'DJ' && <label className='verdant-field'><LocalizedText text={"Pista"} /><input value={details.track} onChange={(event) => onProfessionalDetailsChange(person.id, { ...details, track: event.target.value })} placeholder='Pista / ambiente' /></label>}
                          <label className='verdant-field'><LocalizedText text={"Horário"} /><input type='time' value={details.time} onChange={(event) => onProfessionalDetailsChange(person.id, { ...details, time: event.target.value })} /></label>
                          <label className='verdant-field'><LocalizedText text={"Ordem"} /><input type='number' min='1' value={details.order} onChange={(event) => onProfessionalDetailsChange(person.id, { ...details, order: Math.max(1, Number(event.target.value) || 1) })} /></label>
                        </div>}
                      </div>
                    })}
                  {!availablePeople.some((person) => person.name.toLocaleLowerCase().includes(professionalQuery.trim().toLocaleLowerCase())) && <p className='verdant-professional-empty'><LocalizedText text='Nenhum profissional encontrado.' /></p>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {linkedCount > 0 && <div className='flex flex-wrap gap-2'>{availablePeople.filter((person) => selectedProfessionalIds.includes(person.id)).map((person) => <span className='verdant-status is-open' key={person.id}>{person.name}</span>)}</div>}
          {!availablePeople.length && <p className='verdant-create-professionals-empty'><LocalizedText text={"Nenhum profissional ativo cadastrado para selecionar. Cadastre profissionais antes de ativar esta lista."} /></p>}
        </div>}
        <div className='verdant-config-fields'>
          <label className='verdant-field'>{<LocalizedText text={"Abertura das inscrições"} />}<input type='datetime-local' value={config.openAt} onChange={(event) => onConfigChange({ ...config, openAt: event.target.value })} required /></label>
          {config.key !== 'VIP' && config.key !== 'ANIVERSARIO' && <label className='verdant-field'>{<LocalizedText text={"Valor da lista / consumação"} />}<input type='number' min='0' step='0.01' value={config.price} onChange={(event) => onConfigChange({ ...config, price: Number(event.target.value) })} /><small className='text-muted-foreground'><LocalizedText text={"Este valor aparece no formulário público. O valor geral do evento é independente."} /></small></label>}
          <label className='verdant-field'>{<LocalizedText text={"Entrada permitida a partir das"} />}<input type='time' value={config.start} onChange={(event) => onConfigChange({ ...config, start: event.target.value })} /></label>
          <label className='verdant-field'>{<LocalizedText text={"Validade do nome na lista até"} />}<input type='time' value={config.end} onChange={(event) => onConfigChange({ ...config, end: event.target.value })} /></label>
          <label className='verdant-field'>{<LocalizedText text={"Encerramento das inscrições no dia"} />}<input type='time' value={config.cutoff} onChange={(event) => onConfigChange({ ...config, cutoff: event.target.value })} required /></label>
          {['DJS', 'INFLUENCIADORES', 'LISTA_LOVERS'].includes(config.key) && <label className='verdant-switch-line'><input type='checkbox' checked={config.consumption} onChange={(event) => onConfigChange({ ...config, consumption: event.target.checked })} /><span>{<LocalizedText text={"Valor revertido em consumação"} />}</span></label>}
          {config.key === 'VIP' && <label className='verdant-field'>{<LocalizedText text={"Liberação / Open Bar"} />}<input value={config.openBarTime} onChange={(event) => onConfigChange({ ...config, openBarTime: event.target.value })} placeholder='Após o Open Bar' /></label>}
          <label className='verdant-field wide'>{<LocalizedText text={"Texto complementar para esta data"} />}<textarea rows={2} value={config.publicText} onChange={(event) => onConfigChange({ ...config, publicText: event.target.value })} placeholder='Detalhes que devem aparecer para quem seleciona este evento' /></label>
          {config.key === 'ANIVERSARIO' && <>
            <label className='verdant-field'>{<LocalizedText text={"Máximo de convidados"} />}<input type='number' min='1' max='100' value={config.maxGuests} onChange={(event) => onConfigChange({ ...config, maxGuests: Number(event.target.value) })} required /></label>
            <label className='verdant-field'>{<LocalizedText text={"Regra do valor dos convidados"} />}<select value={config.guestPriceMode} onChange={(event) => onConfigChange({ ...config, guestPriceMode: event.target.value as FormConfig['guestPriceMode'] })}><option value='PORTARIA'>{<LocalizedText text={"Convidado paga valor da portaria"} />}</option><option value='FIXO'>{<LocalizedText text={"Valor fixo"} />}</option></select></label>
            {config.guestPriceMode === 'FIXO' && <label className='verdant-field'>{<LocalizedText text={"Valor por convidado"} />}<input type='number' min='0' step='0.01' value={config.guestPrice} onChange={(event) => onConfigChange({ ...config, guestPrice: Number(event.target.value) })} /></label>}
            <label className='verdant-field'>{<LocalizedText text={"Condição do combo B-Day"} />}<input value={config.birthdayRule ?? ''} onChange={(event) => onConfigChange({ ...config, birthdayRule: event.target.value })} placeholder='Ex.: 10 convidados confirmados' /></label>
            <label className='verdant-field'>{<LocalizedText text={"Condições da pista SKY"} />}<input value={config.skyConditions} onChange={(event) => onConfigChange({ ...config, skyConditions: event.target.value })} /></label>
            <label className='verdant-switch-line'><input type='checkbox' checked={config.acceptsCake} onChange={(event) => onConfigChange({ ...config, acceptsCake: event.target.checked })} /><span>{<LocalizedText text={"Informar que pode levar bolo"} />}</span></label>
          </>}
          <label className='verdant-field wide'>{<LocalizedText text={"Condições adicionais desta data"} />}<textarea rows={2} value={config.extra} onChange={(event) => onConfigChange({ ...config, extra: event.target.value })} placeholder='Texto específico para este evento' /></label>
          <fieldset className='verdant-required-fields wide'>
            <legend>{<LocalizedText text={"Campos obrigatórios"} />}</legend>
            {([
              ['name', 'Nome completo'],
              ['whatsapp', 'WhatsApp com DDD'],
              ['email', 'E-mail'],
              ['consent', 'Resposta sobre receber novidades'],
            ] as const).map(([field, label]) => <label key={field} className='verdant-required-field'><span>{label}</span><input type='checkbox' checked={requiredFields[field]} onChange={(event) => onConfigChange({ ...config, requiredFields: { ...requiredFields, [field]: event.target.checked } })} /></label>)}
            <small><LocalizedText text={"Marcar o consentimento como obrigatório pede uma resposta Sim ou Não; a escolha de aceitar novidades continua voluntária."} /></small>
          </fieldset>
        </div>
      </div>
    </details>
  )
}

function FormsPage({ data, update }: { data: VerdantState; update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean> }) {
  const [filter, setFilter] = useState<FormKey | 'TODOS'>('TODOS')
  return (
    <>
      <SectionHeading section='formularios' />
      <div className='mb-5 verdant-form-card-grid'>
        {[
          { key: 'TRABALHE_CONOSCO', title: 'Trabalhe conosco', href: '/trabalhe-conosco', secondaryHref: '/verdant/cadastros?category=candidates', secondaryLabel: 'Consultar cadastros', fallbackLogo: '/images/verdant-logo-colorida.webp', defaultDescription: 'Cadastre seu interesse para oportunidades de trabalho eventual na Verdant. Nossa equipe entrará em contato conforme a necessidade da casa e sua disponibilidade.' },
          { key: 'EQUIPE', title: 'Equipe — atualização cadastral', href: '/equipe', secondaryHref: '/verdant/cadastros?category=team', secondaryLabel: 'Consultar cadastros', fallbackLogo: '/images/verdant-logo-colorida.webp', defaultDescription: 'Este formulário é destinado a quem já presta serviços na Verdant. Atualize seus dados, informe as funções em que atua e sua disponibilidade. As informações serão utilizadas para atualização cadastral e avaliação interna da equipe.' },
        ].map((item) => (
          <details key={item.key} className='verdant-form-group-accordion'>
            <summary className='verdant-form-group-summary'>
              <div className='verdant-form-link-title'>
                <img src={data.formLogos?.[item.key] || item.fallbackLogo} width={56} height={56} loading='lazy' decoding='async' alt='' />
                <div><b>{item.title}</b><span>Link público de cadastro.</span></div>
              </div>
              <div className='verdant-form-group-summary-meta'>
                <ChevronDown className='verdant-create-config-chevron' size={16} aria-hidden='true' />
              </div>
            </summary>
            <div className='verdant-form-group-body'>
              <FormLogoEditor formKey={item.key} currentLogo={data.formLogos?.[item.key] || ''} fallbackLogo={item.fallbackLogo} update={update} />
              <FormDescriptionEditor
                key={`${item.key}-${data.formDescriptions?.[item.key] ?? item.defaultDescription}`}
                formKey={item.key}
                description={data.formDescriptions?.[item.key] ?? item.defaultDescription}
                update={update}
              />
              <div className='verdant-form-group-linkbar'>
                <code className='verdant-public-url'>{window.location.origin}{item.href}</code>
                <div className='verdant-form-group-actions'>
                  <Button type='button' variant='outline' size='sm' onClick={() => copyText(`${window.location.origin}${item.href}`)}><Copy size={14} />Copiar link</Button>
                  <Button asChild type='button' variant='ghost' size='sm'><a href={item.href} target='_blank' rel='noreferrer'><ExternalLink size={14} />Abrir página</a></Button>
                  <Button asChild type='button' size='sm'><a href={item.secondaryHref}>{item.secondaryLabel}</a></Button>
                </div>
              </div>
            </div>
          </details>
        ))}
      </div>
      <div className='verdant-note'><Clock3 size={16} /><span>{<LocalizedText text="A abertura padrão é terça-feira, às 20h. O encerramento é independente para cada evento: 19h na data, ou 15h para Aniversário. Datas novas podem ser escolhidas livremente, inclusive feriados." />}</span></div>
      <div className='verdant-filter-bar'><ListFilter size={17} /><select aria-label='Filtrar formulário' value={filter} onChange={(event) => setFilter(event.target.value as FormKey | 'TODOS')}><option value='TODOS'>{<LocalizedText text={"Todos os formulários"} />}</option>{FORM_DEFS.map((form) => <option key={form.key} value={form.key}><LocalizedText text={form.title} /></option>)}</select></div>
      <div className='verdant-form-card-grid'>
        {FORM_DEFS.filter((form) => filter === 'TODOS' || filter === form.key).map((definition) => {
          const configs = data.forms.filter((form) => form.key === definition.key).sort((a, b) => (eventById(data, a.eventId)?.date ?? '').localeCompare(eventById(data, b.eventId)?.date ?? ''))
          const enabled = configs.filter((form) => form.enabled).length
          const registrations = sortRows(visibleRegistrations(data).filter((row) => row.formKey === definition.key), (row) => row.createdAt, 'desc').slice(0, 10)
          const registrationCount = visibleRegistrations(data).filter((row) => row.formKey === definition.key).length
          return (
            <details key={definition.key} className='verdant-form-group-accordion'>
              <summary className='verdant-form-group-summary'>
                <div className='verdant-form-link-title'><img src={definition.icon} width={56} height={56} loading='lazy' decoding='async' alt='' /><div><b><LocalizedText text={definition.title} /></b><span>{data.formDescriptions?.[definition.key] ?? definition.description}</span></div></div>
                <div className='verdant-form-group-summary-meta'>
                  <span className='verdant-counter'>{enabled} de {configs.length} datas habilitadas</span>
                  <span className='verdant-counter'>{registrationCount} <LocalizedText text='respostas' /></span>
                  <ChevronDown className='verdant-create-config-chevron' size={16} aria-hidden='true' />
                </div>
              </summary>
              <div className='verdant-form-group-body'>
              <FormLogoEditor formKey={definition.key} currentLogo={data.formLogos?.[definition.key] || ''} fallbackLogo={definition.icon} update={update} />
              <FormDescriptionEditor
                key={`${definition.key}-${data.formDescriptions?.[definition.key] ?? definition.description}`}
                formKey={definition.key}
                description={data.formDescriptions?.[definition.key] ?? definition.description}
                update={update}
              />
              <div className='verdant-form-group-linkbar'>
                  <code className='verdant-public-url'>{formLink(definition.key)}</code>
                  <div className='verdant-form-group-actions'><Button type='button' variant='outline' size='sm' onClick={() => copyText(formLink(definition.key))}><Copy size={14} />{<LocalizedText text={"Copiar link"} leadingSpace />}</Button><Button asChild type='button' variant='ghost' size='sm'><a href={formLink(definition.key)} target='_blank' rel='noreferrer'><ExternalLink size={14} />{<LocalizedText text={"Abrir página"} leadingSpace />}</a></Button></div>
                </div>
                <div className='verdant-config-list'>
                {!configs.length && <div className='verdant-empty-state'>{<LocalizedText text={"Cadastre um evento na agenda para escolher esta data no formulário."} />}</div>}
                {configs.map((config) => <FormConfigEditor key={config.id} config={config} event={eventById(data, config.eventId)} data={data} update={update} />)}
                </div>
                <section className='verdant-form-registrations'>
                  <div className='verdant-form-registrations-heading'><h3><LocalizedText text='Respostas recentes' /></h3><span>{registrationCount} <LocalizedText text='respostas' /></span></div>
                  {!registrations.length
                    ? <p className='text-sm text-muted-foreground'><LocalizedText text='Ainda não há respostas para esta lista.' /></p>
                    : <div className='verdant-table-wrap'><table className='verdant-table'>
                      <thead><tr><th><LocalizedText text='Evento' /></th><th><LocalizedText text='Nome' /></th><th><LocalizedText text='WhatsApp' /></th><th><LocalizedText text='E-mail' /></th><th><LocalizedText text='Opção / convidados' /></th><th><LocalizedText text='Recebido' /></th></tr></thead>
                      <tbody>{registrations.map((row) => <tr key={row.id}>
                        <td data-label={getCurrentLanguage() === 'en' ? 'Event' : 'Evento'}>{row.eventName}<small>{compactDate(row.eventDate)}</small></td>
                        <td data-label={getCurrentLanguage() === 'en' ? 'Name' : 'Nome'}>{row.name}</td>
                        <td data-label='WhatsApp'>{row.whatsapp || '—'}</td>
                        <td data-label={getCurrentLanguage() === 'en' ? 'Email' : 'E-mail'}>{row.email || '—'}</td>
                        <td data-label={getCurrentLanguage() === 'en' ? 'Option / guests' : 'Opção / convidados'}>{row.formKey === 'ANIVERSARIO' ? <BirthdayGuestList guests={row.guestNames} /> : row.sourceDetails || row.optionName || row.profileType || '—'}</td>
                        <td data-label={getCurrentLanguage() === 'en' ? 'Received' : 'Recebido'}>{new Intl.DateTimeFormat(getCurrentLanguage(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.createdAt))}</td>
                      </tr>)}</tbody>
                    </table></div>}
                  {registrationCount > registrations.length && <p className='text-xs text-muted-foreground'><LocalizedText text='Exibindo as 10 respostas mais recentes.' /></p>}
                  {registrationCount > 0 && <a className='verdant-form-registrations-link' href={`/verdant/respostas?form=${definition.key}`}><LocalizedText text='Ver todas as respostas' /> <ArrowRight size={14} /></a>}
                </section>
              </div>
            </details>
          )
        })}
      </div>
    </>
  )
}

function FormLogoEditor({ formKey, currentLogo, fallbackLogo, update }: { formKey: string; currentLogo: string; fallbackLogo: string; update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false)
  const preview = currentLogo || fallbackLogo

  async function chooseLogo(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Use uma imagem PNG, JPG ou WEBP.')
      return
    }
    if (file.size > 600 * 1024) {
      toast.error('A logo deve ter no máximo 600 KB.')
      return
    }
    setBusy(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
        reader.readAsDataURL(file)
      })
      const saved = await update((state) => ({ ...state, formLogos: { ...(state.formLogos || {}), [formKey]: dataUrl } }))
      if (saved) toast.success('Logo do formulário atualizada.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a logo.')
    } finally {
      setBusy(false)
    }
  }

  async function resetLogo() {
    const saved = await update((state) => {
      const next = { ...(state.formLogos || {}) }
      delete next[formKey]
      return { ...state, formLogos: next }
    })
    if (saved) toast.success('Logo padrão restaurada.')
  }

  return (
    <div className='flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex items-center gap-3'>
        <img src={preview} alt='' className='h-14 w-14 rounded-xl border bg-background object-contain p-1' />
        <div><div className='text-sm font-semibold'>Logo do formulário</div><p className='text-xs text-muted-foreground'>PNG, JPG ou WEBP · até 600 KB.</p></div>
      </div>
      <div className='flex flex-wrap gap-2'>
        <label className='inline-flex min-h-9 cursor-pointer items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent'>
          {busy ? 'Salvando…' : 'Trocar logo'}
          <input className='sr-only' type='file' accept='image/png,image/jpeg,image/webp' disabled={busy} onChange={(event) => { void chooseLogo(event.target.files?.[0]); event.currentTarget.value = '' }} />
        </label>
        {currentLogo && <Button type='button' variant='outline' size='sm' onClick={() => { void resetLogo() }}>Restaurar padrão</Button>}
      </div>
    </div>
  )
}

function FormDescriptionEditor({ formKey, description, update }: { formKey: string; description: string; update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean> }) {
  const [draft, setDraft] = useState(description)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await update((state) => ({
      ...state,
      formDescriptions: { ...state.formDescriptions, [formKey]: draft.trim() || FORM_DEFS.find((item) => item.key === formKey)?.description || description },
    }))
    if (saved) toast.success('Texto principal salvo para este formulário.', { duration: 10000 })
  }

  return (
    <form className='grid gap-3 rounded-lg border bg-muted/20 p-4' onSubmit={save}>
      <div>
        <label htmlFor={`form-description-${formKey}`} className='text-sm font-semibold'><LocalizedText text='Texto principal do formulário' /></label>
        <p className='mt-1 text-xs text-muted-foreground'><LocalizedText text='Edite aqui a mensagem exibida no topo do formulário público. Valores, horários e prazos continuam configurados por evento abaixo.' /></p>
      </div>
      <textarea
        id={`form-description-${formKey}`}
        className='min-h-48 w-full rounded-md border bg-background p-3 text-sm leading-relaxed'
        maxLength={3000}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className='flex justify-end'>
        <Button type='submit' size='sm'><LocalizedText text='Salvar texto do formulário' /></Button>
      </div>
    </form>
  )
}

function FormConfigEditor({ config, event, data, update }: { config: FormConfig; event?: VerdantEvent; data: VerdantState; update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean> }) {
  const [draft, setDraft] = useState(config)
  // Keep the local editor draft in sync when the selected form configuration changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(config), [config])
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [fieldsDialogOpen, setFieldsDialogOpen] = useState(false)
  if (!event) return null
  const open = isOpen(data, config.key, event.id)
  const professionalKind = config.key === 'DJS' ? 'DJ' : config.key === 'INFLUENCIADORES' ? 'INFLUENCIADORES' : null
  const linked = professionalKind ? data.people.filter((person) => person.kind === professionalKind && person.active && person.eventIds.includes(event.id)).length : 1
  const lackAssociations = !!professionalKind && linked === 0

  async function save(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault()
    setMessage('')
    setMessageIsError(false)
    if (draft.enabled && lackAssociations) {
      setMessageIsError(true)
      setMessage(`Vincule pelo menos ${professionalKind === 'DJ' ? 'um DJ' : 'um Influencer'} ativo a esta data antes de abrir o formulário.`)
      return
    }
    const saved = await update((state) => ({ ...state, forms: state.forms.map((item) => item.id === draft.id ? draft : item) }))
    if (saved) toast.success('Regras da lista salvas para esta data.', { duration: 10000 })
  }

  return (
    <details className='verdant-config-card'>
      <summary><div className='verdant-config-event'><b>{event.name}</b><span>{weekday(event.date)} · {compactDate(event.date)}{event.eventTime ? ` · evento ${event.eventTime}` : ''}</span></div><StatusPill open={open} enabled={config.enabled} /></summary>
      <form className='verdant-config-form' onSubmit={save} onChange={() => { setMessage(''); setMessageIsError(false) }}>
        <label className='verdant-switch-line'><input type='checkbox' checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /><span>{<LocalizedText text={"Incluir esta data como opção no formulário"} />}</span></label>
        {professionalKind && <div className={`verdant-inline-alert ${lackAssociations ? 'warning' : ''}`}>{lackAssociations ? `Nenhum ${professionalKind === 'DJ' ? 'DJ' : 'Influencer'} vinculado ainda.` : `${linked} profissional(is) vinculado(s) nesta data.`} <Link to={`/verdant/${professionalKind === 'DJ' ? 'djs' : 'influencers'}`}>{<LocalizedText text={"Gerenciar vínculos"} />}</Link></div>}
        <div className='verdant-config-fields'>
          <label className='verdant-field'>{<LocalizedText text={"Abertura das inscrições"} />}<input type='datetime-local' value={draft.openAt} onChange={(e) => setDraft({ ...draft, openAt: e.target.value })} required /></label>
          {config.key !== 'VIP' && config.key !== 'ANIVERSARIO' && <label className='verdant-field'>{<LocalizedText text={"Valor da lista / consumação"} />}<input type='number' min='0' step='0.01' value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} /><small className='text-muted-foreground'>Este é o valor exibido no formulário público. O valor geral do evento é independente.</small></label>}
          <label className='verdant-field'>{<LocalizedText text={"Entrada permitida a partir das"} />}<input type='time' value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
          <label className='verdant-field'>{<LocalizedText text={"Validade do nome na lista até"} />}<input type='time' value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
          <label className='verdant-field'>{<LocalizedText text={"Encerramento das inscrições no dia"} />}<input type='time' value={draft.cutoff} onChange={(e) => setDraft({ ...draft, cutoff: e.target.value })} required /></label>
          {['DJS', 'INFLUENCIADORES', 'LISTA_LOVERS'].includes(config.key) && <label className='verdant-switch-line'><input type='checkbox' checked={draft.consumption} onChange={(e) => setDraft({ ...draft, consumption: e.target.checked })} /><span>{<LocalizedText text={"Valor revertido em consumação"} />}</span></label>}
          {config.key === 'VIP' && <label className='verdant-field'>{<LocalizedText text={"Liberação / Open Bar"} />}<input value={draft.openBarTime} onChange={(e) => setDraft({ ...draft, openBarTime: e.target.value })} placeholder='Após o Open Bar' /></label>}
          <label className='verdant-field wide'>{<LocalizedText text={"Texto complementar para esta data"} />}<textarea rows={2} value={draft.publicText} onChange={(e) => setDraft({ ...draft, publicText: e.target.value })} placeholder='Detalhes que devem aparecer para quem seleciona este evento' /></label>
          {config.key === 'ANIVERSARIO' && <><label className='verdant-field'>{<LocalizedText text={"Máximo de convidados"} />}<input type='number' min='1' max='100' value={draft.maxGuests} onChange={(e) => setDraft({ ...draft, maxGuests: Number(e.target.value) })} required /></label><label className='verdant-field'>{<LocalizedText text={"Regra do valor dos convidados"} />}<select value={draft.guestPriceMode} onChange={(e) => setDraft({ ...draft, guestPriceMode: e.target.value as FormConfig['guestPriceMode'] })}><option value='PORTARIA'>{<LocalizedText text={"Convidado paga valor da portaria"} />}</option><option value='FIXO'>{<LocalizedText text={"Valor fixo"} />}</option></select></label>{draft.guestPriceMode === 'FIXO' && <label className='verdant-field'>{<LocalizedText text={"Valor por convidado"} />}<input type='number' min='0' step='0.01' value={draft.guestPrice} onChange={(e) => setDraft({ ...draft, guestPrice: Number(e.target.value) })} /></label>}<label className='verdant-field'>{<LocalizedText text={"Condição do combo B-Day"} />}<input value={draft.birthdayRule ?? ''} onChange={(e) => setDraft({ ...draft, birthdayRule: e.target.value })} placeholder='Ex.: 10 convidados confirmados' /></label><label className='verdant-field'>{<LocalizedText text={"Condições da pista SKY"} />}<input value={draft.skyConditions} onChange={(e) => setDraft({ ...draft, skyConditions: e.target.value })} /></label><label className='verdant-switch-line'><input type='checkbox' checked={draft.acceptsCake} onChange={(e) => setDraft({ ...draft, acceptsCake: e.target.checked })} /><span>{<LocalizedText text={"Informar que pode levar bolo"} />}</span></label></>}
          <label className='verdant-field wide'>{<LocalizedText text={"Condições adicionais desta data"} />}<textarea rows={2} value={draft.extra} onChange={(e) => setDraft({ ...draft, extra: e.target.value })} placeholder='Texto específico para este evento' /></label>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 wide'>
          <div><b className='text-sm'>{<LocalizedText text={"Campos do formulário"} />}</b><p className='text-xs text-muted-foreground'>{<LocalizedText text={"Escolha quais dados a pessoa precisa informar nesta lista."} />}</p></div>
          <Button type='button' size='sm' variant='outline' onClick={() => setFieldsDialogOpen(true)}><Settings2 size={14} />{<LocalizedText text={"Configurar obrigatoriedade"} leadingSpace />}</Button>
        </div>
        {fieldsDialogOpen && <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4' onMouseDown={(e) => { if (e.target === e.currentTarget) setFieldsDialogOpen(false) }}>
          <section className='w-full max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border bg-background p-5 shadow-2xl' role='dialog' aria-modal='true' aria-labelledby={`required-fields-${config.id}`}>
            <h3 id={`required-fields-${config.id}`} className='text-lg font-semibold'>{<LocalizedText text={"Campos obrigatórios"} />}</h3>
            <p className='mb-4 mt-1 text-sm text-muted-foreground'>{<LocalizedText text={"Essas regras valem para esta lista e esta data."} />}</p>
            {([
              ['name', 'Nome completo'],
              ['whatsapp', 'WhatsApp com DDD'],
              ['email', 'E-mail'],
              ['consent', 'Resposta sobre receber novidades'],
            ] as const).map(([field, label]) => <label key={field} className='verdant-switch-line flex w-full justify-between border-t py-3'>
              <span>{label}</span>
              <input type='checkbox' checked={requiredFieldsFor(draft)[field]} onChange={(e) => setDraft({ ...draft, requiredFields: { ...requiredFieldsFor(draft), [field]: e.target.checked } })} />
            </label>)}
            <p className='mb-4 text-xs text-muted-foreground'>{<LocalizedText text={"Por padrão, a pessoa escolhe Sim ou Não. Marcar Não é permitido; o aceite para receber novidades continua voluntário."} />}</p>
            <div className='flex justify-end'><Button type='button' onClick={() => setFieldsDialogOpen(false)}>{<LocalizedText text={"Concluir"} />}</Button></div>
          </section>
        </div>}
        {message && <div role={messageIsError ? 'alert' : 'status'} aria-live={messageIsError ? 'assertive' : 'polite'} className={`verdant-flash ${messageIsError ? 'warning' : ''}`}>{message}</div>}
        <div className='verdant-config-footer'><small>{open ? `Aberto agora · encerra ${compactDate(event.date)} às ${draft.cutoff}` : `Link fixo: /lista/${slugByForm[config.key]}`}</small><Button size='sm' type='submit'>{<LocalizedText text={"Salvar configuração"} />}</Button></div>
      </form>
    </details>
  )
}

type ListStatusFilter = 'active' | 'upcoming' | 'closed' | 'disabled' | 'archived' | 'deleted' | 'all'

function listStatus(data: VerdantState, config: FormConfig, now = Date.now()) {
  const event = eventById(data, config.eventId)
  if (config.deletedAt) return 'deleted'
  if (config.archivedAt) return 'archived'
  if (!event || !event.active || !config.enabled) return 'disabled'
  const opens = new Date(config.openAt.length === 16 ? `${config.openAt}:00-03:00` : config.openAt).getTime()
  const cutoff = config.cutoff || (config.key === 'ANIVERSARIO' ? '15:00' : '19:00')
  const closes = new Date(`${event.date}T${cutoff}:00-03:00`).getTime()
  if (Number.isFinite(closes) && now >= closes) return 'closed'
  if (Number.isFinite(opens) && now < opens) return 'upcoming'
  return 'active'
}

function ListsPage({ data, update }: { data: VerdantState; update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean> }) {
  const [eventId, setEventId] = useState('')
  const [formKey, setFormKey] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<ListStatusFilter>('active')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const rows = data.forms
    .map((config) => ({ config, event: eventById(data, config.eventId), status: listStatus(data, config, now) }))
    .filter((row) => !eventId || row.config.eventId === eventId)
    .filter((row) => !formKey || row.config.key === formKey)
    .filter((row) => !date || row.event?.date === date)
    .filter((row) => {
      if (status === 'all') return true
      return row.status === status
    })
    .sort((a, b) => `${a.event?.date || ''}|${formTitle(a.config.key)}`.localeCompare(`${b.event?.date || ''}|${formTitle(b.config.key)}`, 'pt-BR'))

  async function setLifecycle(config: FormConfig, action: 'archive' | 'restore' | 'delete') {
    const stamp = new Date().toISOString()
    const saved = await update((state) => ({
      ...state,
      forms: state.forms.map((item) => item.id !== config.id ? item : action === 'archive'
        ? { ...item, archivedAt: stamp, enabled: false }
        : action === 'delete'
          ? { ...item, deletedAt: stamp, enabled: false }
          : { ...item, archivedAt: undefined, deletedAt: undefined }),
    }))
    if (saved) toast.success(action === 'archive' ? 'Lista arquivada.' : action === 'delete' ? 'Lista marcada como excluída.' : 'Lista restaurada.')
  }

  const statusLabel: Record<string, string> = {
    active: 'Ativo',
    upcoming: 'Em breve',
    closed: 'Encerrado',
    disabled: 'Desabilitado',
    archived: 'Arquivado',
    deleted: 'Excluído',
  }

  return (
    <>
      <SectionHeading section='listas' />
      <Card>
        <CardContent className='pt-6'>
          <div className='mb-4 grid gap-3 md:grid-cols-4'>
            <label className='verdant-field'><span>Evento</span><select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value=''>Todos os eventos</option>{data.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map((event)=><option key={event.id} value={event.id}>{compactDate(event.date)} · {event.name}</option>)}</select></label>
            <label className='verdant-field'><span>Data</span><input type='date' value={date} onChange={(e)=>setDate(e.target.value)} /></label>
            <label className='verdant-field'><span>Lista</span><select value={formKey} onChange={(e)=>setFormKey(e.target.value)}><option value=''>Todas as listas</option>{FORM_DEFS.map((form)=><option key={form.key} value={form.key}>{form.title}</option>)}</select></label>
            <label className='verdant-field'><span>Situação</span><select value={status} onChange={(e)=>setStatus(e.target.value as ListStatusFilter)}><option value='active'>Ativo</option><option value='upcoming'>Em breve</option><option value='closed'>Encerrado</option><option value='disabled'>Desabilitado</option><option value='archived'>Arquivado</option><option value='deleted'>Excluído</option><option value='all'>Todos</option></select></label>
          </div>
          <div className='verdant-table-wrap'>
            <table className='verdant-table'>
              <thead><tr><th>Data</th><th>Evento</th><th>Lista</th><th>Horário</th><th>Situação</th><th>Ações</th></tr></thead>
              <tbody>{rows.map(({ config, event, status: rowStatus }) => <tr key={config.id}>
                <td data-label='Data'>{event ? compactDate(event.date) : '—'}</td>
                <td data-label='Evento'>{event?.name || 'Evento indisponível'}</td>
                <td data-label='Lista'>{formTitle(config.key)}</td>
                <td data-label='Horário'>{config.start && config.end ? `${config.start}–${config.end}` : config.key === 'ENTRADA_GRATUITA' ? 'Gratuita até 00h' : 'Conforme evento'}</td>
                <td data-label='Situação'><span className='verdant-counter'>{statusLabel[rowStatus] || rowStatus}</span></td>
                <td data-label='Ações'><div className='flex flex-wrap gap-2'>
                  <Button asChild size='sm' variant='outline'><a href={formLink(config.key)} target='_blank' rel='noreferrer'>Abrir</a></Button>
                  <Button asChild size='sm' variant='ghost'><a href={`/verdant/respostas?event=${encodeURIComponent(config.eventId)}&form=${encodeURIComponent(config.key)}`}>Respostas</a></Button>
                  {(rowStatus === 'archived' || rowStatus === 'deleted') ? <Button size='sm' variant='ghost' onClick={()=>{ void setLifecycle(config,'restore') }}>Restaurar</Button> : <>
                    <Button size='sm' variant='ghost' onClick={()=>{ void setLifecycle(config,'archive') }}>Arquivar</Button>
                    <Button size='sm' variant='ghost' onClick={()=>{ if(window.confirm('Marcar esta lista como excluída? O histórico de respostas será preservado.')) void setLifecycle(config,'delete') }}>Excluir</Button>
                  </>}
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
          {!rows.length && <div className='verdant-empty-state'><ClipboardList size={26}/><p>Nenhuma lista corresponde aos filtros selecionados.</p></div>}
          <div className='verdant-table-total'>{rows.length} lista(s) exibida(s)</div>
        </CardContent>
      </Card>
    </>
  )
}

type RegistrationSortKey = 'name' | 'whatsapp' | 'email' | 'eventName' | 'formKey' | 'optionName' | 'consent' | 'createdAt'

function RegistrationsPage({
  data,
  update,
  serverConnected,
  standalone = false,
}: {
  data: VerdantState
  update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean>
  serverConnected: boolean
  standalone?: boolean
}) {
  const [query, setQuery] = useState('')
  const [eventId, setEventId] = useState(() => new URLSearchParams(window.location.search).get('event') || '')
  const [formKey, setFormKey] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('form')
    return FORM_DEFS.some((form) => form.key === requested) ? requested! : ''
  })
  const [consent, setConsent] = useState('')
  const [sortKey, setSortKey] = useState<RegistrationSortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const filtered = visibleRegistrations(data).filter((row) => {
    const search = `${row.name} ${row.whatsapp} ${row.email} ${row.eventName} ${row.optionName}`.toLowerCase()
    const matchesConsent = !consent
      || (consent === 'sem-resposta' ? row.consentAnswered === false : row.consentAnswered !== false && row.consent === (consent === 'sim'))
    return (!query || search.includes(query.toLowerCase())) && (!eventId || row.eventId === eventId) && (!formKey || row.formKey === formKey) && matchesConsent
  })
  const sorted = sortRows(filtered, (row) => {
    if (sortKey === 'optionName') return row.optionName || row.profileType
    if (sortKey === 'consent') return row.consentAnswered === false ? 0 : row.consent ? 2 : 1
    return row[sortKey]
  }, sortDirection, getCurrentLanguage() === 'en' ? 'en' : 'pt-BR')
  const groups = [...new Map(sorted.map((row) => [row.eventId, row.eventName])).entries()]
    .map(([id, name]) => ({ id, name, date: data.events.find((item) => item.id === id)?.date ?? '', rows: sorted.filter((row) => row.eventId === id) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const toggleSort = (key: RegistrationSortKey) => {
    setSortDirection((current) => key === sortKey && current === 'asc' ? 'desc' : 'asc')
    setSortKey(key)
  }
  return (
    <>
      {standalone ? <SectionHeading section='respostas' /> : <><SectionHeading section='clientes' /><CustomerImportPanel /><HistoricalRegistrationImportPanel data={data} update={update} serverConnected={serverConnected} /></>}
      <Card>
        <CardContent className='pt-6'>
          <div className='mb-4'><h2 className='font-semibold'>{<LocalizedText text={"Inscrições dos formulários"} />}</h2><p className='mt-1 text-sm text-muted-foreground'>{<LocalizedText text={"Respostas novas recebidas nos cinco formulários."} />}</p></div>
          <div className='verdant-table-filters'><label className='verdant-search-field'><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={getCurrentLanguage() === 'en' ? 'Search name, WhatsApp, email, or event' : 'Buscar nome, WhatsApp, e-mail ou evento'} /></label><select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value=''>{<LocalizedText text={"Todos os eventos"} />}</option>{data.events.slice().sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pt-BR')).map((event) => <option key={event.id} value={event.id}>{compactDate(event.date)} · {event.name}</option>)}</select><select value={formKey} onChange={(e) => setFormKey(e.target.value)}><option value=''>{<LocalizedText text={"Todas as listas"} />}</option>{FORM_DEFS.map((form) => <option key={form.key} value={form.key}><LocalizedText text={form.title} /></option>)}</select><select value={consent} onChange={(e) => setConsent(e.target.value)}><option value=''>{<LocalizedText text={"Todos os consentimentos"} />}</option><option value='sim'>{<LocalizedText text={"Aceitou novidades"} />}</option><option value='nao'>{<LocalizedText text={"Não aceitou"} />}</option><option value='sem-resposta'>{<LocalizedText text={"Sem resposta"} />}</option></select></div>
                    {groups.map((group) => <details className='verdant-registration-group' key={group.id} open={groups.length === 1}><summary><b>{group.date ? `${compactDate(group.date)} · ` : ''}{group.name}</b> <small>{group.rows.length} {getCurrentLanguage() === 'en' ? 'registrations' : 'inscrições'} · {FORM_DEFS.map((form) => ({ title: form.title, total: group.rows.filter((row) => row.formKey === form.key).length })).filter((item) => item.total).map((item) => `${item.title.replace(/^Lista (de )?/, '').replace(/ Verdant$/, '')}: ${item.total}`).join(' · ')}</small></summary><div className='verdant-table-wrap'><table className='verdant-table'>
            <thead><tr>
              <SortableTableHeader label={<LocalizedText text='Nome' />} active={sortKey === 'name'} direction={sortDirection} onClick={() => toggleSort('name')} />
              <SortableTableHeader label={<LocalizedText text='WhatsApp' />} active={sortKey === 'whatsapp'} direction={sortDirection} onClick={() => toggleSort('whatsapp')} />
              <SortableTableHeader label={<LocalizedText text='E-mail' />} active={sortKey === 'email'} direction={sortDirection} onClick={() => toggleSort('email')} />
              <SortableTableHeader label={<LocalizedText text='Evento' />} active={sortKey === 'eventName'} direction={sortDirection} onClick={() => toggleSort('eventName')} />
              <SortableTableHeader label={<LocalizedText text='Formulário' />} active={sortKey === 'formKey'} direction={sortDirection} onClick={() => toggleSort('formKey')} />
              <SortableTableHeader label={<LocalizedText text='Opção / convidados' />} active={sortKey === 'optionName'} direction={sortDirection} onClick={() => toggleSort('optionName')} />
              <SortableTableHeader label={<LocalizedText text='Novidades' />} active={sortKey === 'consent'} direction={sortDirection} onClick={() => toggleSort('consent')} />
              <SortableTableHeader label={<LocalizedText text='Recebido' />} active={sortKey === 'createdAt'} direction={sortDirection} onClick={() => toggleSort('createdAt')} />
            </tr></thead>
            <tbody>{group.rows.map((row) => <tr key={row.id}><td data-label={getCurrentLanguage() === 'en' ? 'Name' : 'Nome'}>{row.name}</td><td data-label='WhatsApp'>{row.whatsapp}</td><td data-label={getCurrentLanguage() === 'en' ? 'Email' : 'E-mail'}>{row.email}</td><td data-label={getCurrentLanguage() === 'en' ? 'Event' : 'Evento'}>{row.eventName}<small>{compactDate(row.eventDate)}</small></td><td data-label={getCurrentLanguage() === 'en' ? 'Form' : 'Formulário'}><LocalizedText text={formTitle(row.formKey)} /></td><td data-label={getCurrentLanguage() === 'en' ? 'Option / guests' : 'Opção / convidados'}>{row.formKey === 'ANIVERSARIO' ? <BirthdayGuestList guests={row.guestNames} /> : row.sourceDetails || <LocalizedText text={row.optionName || row.profileType || '—'} />}</td><td data-label={getCurrentLanguage() === 'en' ? 'Updates' : 'Novidades'}><LocalizedText text={row.consentAnswered === false ? 'Sem resposta' : row.consent ? 'Sim' : 'Não'} /></td><td data-label={getCurrentLanguage() === 'en' ? 'Received' : 'Recebido'}>{new Intl.DateTimeFormat(getCurrentLanguage(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.createdAt))}</td></tr>)}</tbody>
          </table></div></details>)}
          {!filtered.length && <div className='verdant-empty-state'><ClipboardList size={26} /><p>{visibleRegistrations(data).length ? 'Nenhuma inscrição corresponde a estes filtros.' : 'As respostas enviadas pelos formulários aparecerão aqui.'}</p></div>}
          <div className='verdant-table-total'>{filtered.length} inscrição(ões) exibida(s) · aniversários contam cada convidado separadamente</div>
        </CardContent>
      </Card>
    </>
  )
}

type StoredCustomer = ImportedCustomer & { id: string; cpfValid: boolean; sourceSystem: string; importedAt: string; updatedAt: string }
type CustomerColumnFilterKey = 'name' | 'cpf' | 'phone' | 'email' | 'presenceCount' | 'lastVisitAt' | 'balance' | 'sourceSystem'
const customerColumnFilters: { key: CustomerColumnFilterKey; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Nome', placeholder: 'Filtrar nome' },
  { key: 'cpf', label: 'CPF', placeholder: 'Filtrar CPF' },
  { key: 'phone', label: 'WhatsApp', placeholder: 'Filtrar WhatsApp' },
  { key: 'email', label: 'E-mail', placeholder: 'Filtrar e-mail' },
  { key: 'presenceCount', label: 'Presenças', placeholder: 'Filtrar presenças' },
  { key: 'lastVisitAt', label: 'Última visita', placeholder: 'Filtrar última visita' },
  { key: 'balance', label: 'Saldo / consumo', placeholder: 'Filtrar saldo ou consumo' },
  { key: 'sourceSystem', label: 'Origem', placeholder: 'Filtrar origem' },
]

function CustomerImportPanel() {
  const { language } = useLanguage()
  const [customers, setCustomers] = useState<StoredCustomer[]>([])
  const [preview, setPreview] = useState<ImportedCustomer[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [skipped, setSkipped] = useState(0)
  const [duplicateRows, setDuplicateRows] = useState(0)
  const [possibleDuplicateRows, setPossibleDuplicateRows] = useState(0)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [columnFilters, setColumnFilters] = useState<Record<CustomerColumnFilterKey, string>>({ name: '', cpf: '', phone: '', email: '', presenceCount: '', lastVisitAt: '', balance: '', sourceSystem: '' })
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [sortKey, setSortKey] = useState<CustomerColumnFilterKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const loadCustomers = useCallback(async (
    nextOffset: number,
    search: string,
    filters: Record<CustomerColumnFilterKey, string>,
    currentSort = sortKey,
    currentDirection = sortDirection,
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: search, offset: String(nextOffset), limit: '50' })
      params.set('sort', currentSort)
      params.set('direction', currentDirection)
      if (Object.values(filters).some(Boolean)) params.set('filters', JSON.stringify(filters))
      const response = await fetch(`/api/customers?${params}`, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error(response.status === 401 ? 'Entre novamente para consultar a base.' : 'Não foi possível carregar a base de clientes.')
      const result = await response.json() as { total: number; customers: StoredCustomer[] }
      setCustomers(result.customers)
      setTotal(result.total)
      setOffset(nextOffset)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao consultar a base.')
    } finally { setLoading(false) }
  }, [sortDirection, sortKey])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCustomers(0, query, columnFilters) }, 300)
    return () => window.clearTimeout(timer)
  }, [loadCustomers, query, columnFilters])

  async function selectFile(file?: File) {
    if (!file) return
    setError(''); setNotice(''); setPreview(null); setFileName(file.name); setProgress(0)
    setLoading(true)
    try {
      const result = await readCustomerImport(file)
      setPreview(result.customers)
      setSkipped(result.skipped)
      setDuplicateRows(result.duplicateRows)
      setPossibleDuplicateRows(result.possibleDuplicateRows)
      if (!result.customers.length) throw new Error('O arquivo não contém registros com nome e identificador de origem.')
    } catch (cause) {
      setFileName('')
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.')
    } finally { setLoading(false) }
  }

  async function importFile() {
    if (!preview?.length) return
    setImporting(true); setError(''); setNotice(''); setProgress(0)
    const batchSize = 400
    let created = 0
    let updated = 0
    let completedPercent = 0
    try {
      for (let start = 0; start < preview.length; start += batchSize) {
        const response = await fetch('/api/customers/import', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceSystem: 'export-verdant', customers: preview.slice(start, start + batchSize) }),
        })
        const result = await response.json() as { created?: number; updated?: number; error?: string }
        if (!response.ok) throw new Error(result.error || 'A importação foi interrompida.')
        created += result.created ?? 0
        updated += result.updated ?? 0
        completedPercent = Math.min(100, Math.round((Math.min(start + batchSize, preview.length) / preview.length) * 100))
        setProgress(completedPercent)
      }
      setNotice(language === 'en'
        ? `Import complete: ${created.toLocaleString(language)} new customers and ${updated.toLocaleString(language)} records updated or merged.`
        : `Importação concluída: ${created.toLocaleString(language)} clientes novos e ${updated.toLocaleString(language)} registros atualizados/mesclados.`)
      setPreview(null); setFileName(''); setProgress(100)
      await loadCustomers(0, query, columnFilters)
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'Erro na importação'} Progresso parcial: ${completedPercent}%. Você pode selecionar o mesmo arquivo novamente; os identificadores estáveis evitam duplicar os registros já importados.`)
    } finally { setImporting(false) }
  }

  const flagged = preview?.filter((customer) => customer.qualityFlags.length).length ?? 0
  const toggleSort = (key: CustomerColumnFilterKey) => {
    setSortDirection((current) => key === sortKey && current === 'asc' ? 'desc' : 'asc')
    setSortKey(key)
  }
  return <Card className='mb-5'>
    <CardHeader><div className='flex items-start justify-between gap-3'><div><CardTitle>{<LocalizedText text={"Base histórica de clientes"} />}</CardTitle><CardDescription>{<LocalizedText text={"Importe o Excel ou CSV de origem. O sistema seleciona os campos úteis para identificação e conferência, sem levar as colunas operacionais que não serão usadas."} />}</CardDescription></div><div className='verdant-export-icon'><FileSpreadsheet size={18} /></div></div></CardHeader>
    <CardContent className='space-y-4'>
      <div className='rounded-lg border bg-muted/30 p-3 text-sm'><b>{<LocalizedText text={"Campos importados:"} />}</b>{<LocalizedText text={"identificador de origem, nome, CPF, WhatsApp, e-mail, aniversário, presenças, primeira entrada, última visita, saldo, consumo, ID do evento e data da primeira interação."} leadingSpace trailingSpace />}<span className='text-muted-foreground'>{<LocalizedText text={"Gênero, aplicativo ativo e primeira utilização ficam de fora. Consentimento de marketing não existe no arquivo e não será presumido."} />}</span></div>
      <div className='flex flex-wrap items-center gap-3'><label className='verdant-search-field max-w-full cursor-pointer'><Upload size={16} /><span>{<LocalizedText text={"Selecionar arquivo .xlsx ou .csv"} />}</span><input className='sr-only' type='file' accept='.xlsx,.csv' disabled={loading || importing} onChange={(event) => { void selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></label><span className='text-sm text-muted-foreground'>{fileName || 'A importação mostra uma prévia antes de gravar.'}</span>{loading && <span className='text-sm'>{<LocalizedText text={"Lendo arquivo…"} />}</span>}</div>
      {preview && <div className='space-y-3 rounded-lg border p-4'>
        <div><b>{<LocalizedText text={"Prévia antes de importar"} />}</b><p className='text-sm text-muted-foreground'>{language === 'en' ? `${preview.length.toLocaleString(language)} rows ready · ${flagged.toLocaleString(language)} flagged for review · ${skipped.toLocaleString(language)} without an ID or name skipped · ${duplicateRows.toLocaleString(language)} duplicate source IDs or valid CPFs will be updated without creating a new record · ${possibleDuplicateRows.toLocaleString(language)} possible duplicates by contact flagged for review.` : `${preview.length.toLocaleString(language)} linhas prontas · ${flagged.toLocaleString(language)} com campos para revisão · ${skipped.toLocaleString(language)} sem identificador/nome ignoradas · ${duplicateRows.toLocaleString(language)} repetidas por identificador ou CPF válido serão atualizadas, sem criar nova ficha · ${possibleDuplicateRows.toLocaleString(language)} possíveis duplicidades por contato ficam marcadas para conferência.`}</p><p className='mt-1 text-sm text-muted-foreground'>{<LocalizedText text={"Correspondência automática somente por identificador de origem ou CPF válido. Nome, e-mail e telefone repetidos não são unificados automaticamente."} />}</p></div>
        {flagged > 0 && <div className='flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'><AlertTriangle size={17} className='mt-0.5 shrink-0' /><span>{<LocalizedText text={"Registros com CPF, data, e-mail ou telefone fora do padrão serão importados marcados para revisão; não serão apagados silenciosamente nem usados como chave para mesclar."} />}</span></div>}
        <div className='max-h-52 overflow-auto'><table className='verdant-table'><thead><tr><th><LocalizedText text={"Nome"} /></th><th><LocalizedText text={"CPF"} /></th><th><LocalizedText text={"WhatsApp"} /></th><th><LocalizedText text={"Última visita"} /></th><th><LocalizedText text={"Revisão"} /></th></tr></thead><tbody>{preview.slice(0, 8).map((customer) => <tr key={customer.sourceId}><td data-label={language === 'en' ? 'Name' : 'Nome'}>{customer.name}</td><td data-label='CPF'>{customer.cpf || '—'}</td><td data-label='WhatsApp'>{customer.phone || '—'}</td><td data-label={language === 'en' ? 'Last visit' : 'Última visita'}>{customer.lastVisitAt || '—'}</td><td data-label={language === 'en' ? 'Review' : 'Revisão'}>{customer.qualityFlags.join(', ') || 'OK'}</td></tr>)}</tbody></table></div>
        {preview.length > 8 && <small className='text-muted-foreground'>{<LocalizedText text={"Exibindo 8 exemplos; os demais também serão processados."} />}</small>}
        {importing && <div className='space-y-1'><div className='h-2 overflow-hidden rounded bg-muted'><div className='h-full bg-emerald-500 transition-all' style={{ width: `${progress}%` }} /></div><small>{progress}% importado</small></div>}
        <Button className='verdant-report-primary' onClick={() => void importFile()} disabled={importing || !preview.length}><Upload size={15} />{importing ? (language === 'en' ? 'Importing…' : 'Importando…') : language === 'en' ? `Import ${preview.length.toLocaleString(language)} records` : `Importar ${preview.length.toLocaleString(language)} registros`}</Button>
      </div>}
      {notice && <p role='status' className='rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'>{notice}</p>}
      {error && <p role='alert' className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>{error}</p>}
      <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-4'><div><b>{total.toLocaleString(language)}</b>{<LocalizedText text={"clientes históricos na base"} leadingSpace />}<p className='text-xs text-muted-foreground'>{<LocalizedText text={"Registros importados ficam separados das inscrições recentes, mas disponíveis nesta aba para busca e conferência."} />}</p></div><label className='verdant-search-field max-w-full'><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === 'en' ? 'Search by name, CPF, or phone' : 'Buscar na base por nome, CPF ou telefone'} /></label></div>
      <div className='verdant-column-filter-bar' aria-label={language === 'en' ? 'Filter historical customers by column' : 'Filtrar clientes históricos por coluna'}>{customerColumnFilters.map((column) => <ColumnFilterControl key={column.key} label={column.label} placeholder={column.placeholder} value={columnFilters[column.key]} onChange={(value) => setColumnFilters((current) => ({ ...current, [column.key]: value }))} />)}</div>
      <div className='verdant-table-wrap'><table className='verdant-table'>
        <thead><tr>
          <SortableTableHeader label={<LocalizedText text='Nome' />} active={sortKey === 'name'} direction={sortDirection} onClick={() => toggleSort('name')} />
          <SortableTableHeader label={<LocalizedText text='CPF' />} active={sortKey === 'cpf'} direction={sortDirection} onClick={() => toggleSort('cpf')} />
          <SortableTableHeader label={<LocalizedText text='WhatsApp' />} active={sortKey === 'phone'} direction={sortDirection} onClick={() => toggleSort('phone')} />
          <SortableTableHeader label={<LocalizedText text='E-mail' />} active={sortKey === 'email'} direction={sortDirection} onClick={() => toggleSort('email')} />
          <SortableTableHeader label={<LocalizedText text='Presenças' />} active={sortKey === 'presenceCount'} direction={sortDirection} onClick={() => toggleSort('presenceCount')} />
          <SortableTableHeader label={<LocalizedText text='Última visita' />} active={sortKey === 'lastVisitAt'} direction={sortDirection} onClick={() => toggleSort('lastVisitAt')} />
          <SortableTableHeader label={<LocalizedText text='Saldo / consumo' />} active={sortKey === 'balance'} direction={sortDirection} onClick={() => toggleSort('balance')} />
          <SortableTableHeader label={<LocalizedText text='Origem' />} active={sortKey === 'sourceSystem'} direction={sortDirection} onClick={() => toggleSort('sourceSystem')} />
        </tr></thead>
        <tbody>{customers.map((customer) => <tr key={customer.id}><td data-label={language === 'en' ? 'Name' : 'Nome'}>{customer.name}{customer.qualityFlags?.length > 0 && <small>{customer.qualityFlags.join(' · ')}</small>}</td><td data-label='CPF'>{customer.cpf || '—'}{customer.cpf && !customer.cpfValid && <small><LocalizedText text={"Revisar"} /></small>}</td><td data-label='WhatsApp'>{customer.phone || '—'}</td><td data-label={language === 'en' ? 'Email' : 'E-mail'}>{customer.email || '—'}</td><td data-label={language === 'en' ? 'Visits' : 'Presenças'}>{customer.presenceCount}</td><td data-label={language === 'en' ? 'Last visit' : 'Última visita'}>{customer.lastVisitAt || '—'}</td><td data-label={language === 'en' ? 'Balance / spend' : 'Saldo / consumo'}>{money(customer.availableBalance)} / {money(customer.consumption)}</td><td data-label={language === 'en' ? 'Source' : 'Origem'}>{customer.sourceSystem}</td></tr>)}</tbody>
      </table></div>
      <div className='flex items-center justify-between text-sm text-muted-foreground'><span>{loading ? 'Carregando…' : `${customers.length ? offset + 1 : 0}–${Math.min(offset + customers.length, total)} de ${total}`}</span><div className='flex gap-2'><Button variant='outline' size='sm' disabled={loading || offset === 0} onClick={() => void loadCustomers(Math.max(0, offset - 50), query, columnFilters)}>{<LocalizedText text={"Anterior"} />}</Button><Button variant='outline' size='sm' disabled={loading || offset + 50 >= total} onClick={() => void loadCustomers(offset + 50, query, columnFilters)}>{<LocalizedText text={"Próxima"} />}</Button></div></div>
    </CardContent>
  </Card>
}

function HistoricalRegistrationImportPanel({
  data,
  update,
  serverConnected,
}: {
  data: VerdantState
  update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean>
  serverConnected: boolean
}) {
  const { language } = useLanguage()
  const [preview, setPreview] = useState<HistoricalRegistrationImport | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function selectFile(file?: File) {
    if (!file) return
    setPreview(null)
    setNotice('')
    setError('')
    setLoading(true)
    try {
      setPreview(await readHistoricalRegistrationImport(file, data.events, data.registrations))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler a planilha.')
    } finally {
      setLoading(false)
    }
  }

  async function importFile() {
    if (!preview?.registrations.length || !serverConnected) return
    setImporting(true)
    setError('')
    setNotice('')
    let added = 0
    try {
      const saved = await update((state) => {
        const existing = new Set(state.registrations.flatMap((registration) => [
          registration.id,
          ...(registration.sourceSystem && registration.sourceId ? [`${registration.sourceSystem}:${registration.sourceId}`] : []),
        ]))
        const additions = preview.registrations.filter((registration) =>
          !existing.has(registration.id) && !existing.has(`${registration.sourceSystem}:${registration.sourceId}`))
        added = additions.length
        return { ...state, registrations: [...state.registrations, ...additions] }
      })
      if (!saved) throw new Error('A importação não foi salva. Recarregue os dados e gere uma nova prévia antes de tentar novamente.')
      setNotice(language === 'en'
        ? `${added.toLocaleString(language)} historical registrations added. Existing registrations and customers were preserved.`
        : `${added.toLocaleString(language)} inscrições históricas adicionadas. As inscrições e os clientes existentes foram preservados.`)
      setPreview(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as inscrições históricas.')
    } finally {
      setImporting(false)
    }
  }

  return <Card className='mb-5'>
    <CardHeader>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <CardTitle>{language === 'en' ? 'Historical form registrations' : 'Inscrições históricas dos formulários'}</CardTitle>
          <CardDescription>{language === 'en'
            ? 'Import the “Lista Única” and “Agenda de Eventos” sheets into dashboard summaries and charts.'
            : 'Importe as abas “Lista Única” e “Agenda de Eventos” para os resumos e gráficos do painel.'}</CardDescription>
        </div>
        <div className='verdant-export-icon'><FileSpreadsheet size={18} /></div>
      </div>
    </CardHeader>
    <CardContent className='space-y-4'>
      <p className='rounded-lg border bg-muted/30 p-3 text-sm'>
        {language === 'en'
          ? 'The response ID prevents duplicate registrations. This file has no customer ID or CPF, so names, phone numbers, and emails are not used to merge customer records. Events are linked only when their date identifies exactly one existing event; unmatched events are not created.'
          : 'O ID da resposta evita inscrições repetidas. Este arquivo não tem ID de cliente nem CPF; nomes, telefones e e-mails não serão usados para mesclar clientes. O evento só é vinculado quando a data identifica exatamente um evento existente; eventos sem correspondência não são criados.'}
      </p>
      {!serverConnected && <p className='text-sm text-destructive'>
        {language === 'en' ? 'Connect to the server to preview against current events and registrations.' : 'Conecte ao servidor para gerar uma prévia comparada aos eventos e inscrições atuais.'}
      </p>}
      <div className='flex flex-wrap items-center gap-3'>
        <label className='verdant-search-field max-w-full cursor-pointer'>
          <Upload size={16} />
          <span>{language === 'en' ? 'Select the original .xlsx file' : 'Selecionar a planilha original .xlsx'}</span>
          <input
            className='sr-only'
            type='file'
            accept='.xlsx'
            disabled={!serverConnected || loading || importing}
            onChange={(event) => { void selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }}
          />
        </label>
        {loading && <span className='text-sm text-muted-foreground'>{language === 'en' ? 'Reading workbook…' : 'Lendo planilha…'}</span>}
      </div>
      {preview && <div className='space-y-2 rounded-lg border p-4 text-sm'>
        <b>{language === 'en' ? 'Import preview' : 'Prévia da importação'}</b>
        <p>{language === 'en'
          ? `${preview.sourceRows.toLocaleString(language)} source rows · ${preview.readyRows.toLocaleString(language)} new registrations ready · ${preview.alreadyImported.toLocaleString(language)} already imported · ${preview.duplicateRows.toLocaleString(language)} repeated source rows collapsed · ${preview.conflictingSourceIds.toLocaleString(language)} conflicting response IDs skipped · ${preview.skippedInvalid.toLocaleString(language)} invalid rows · ${preview.unsupportedCategory.toLocaleString(language)} unsupported categories.`
          : `${preview.sourceRows.toLocaleString(language)} linhas na origem · ${preview.readyRows.toLocaleString(language)} novas inscrições prontas · ${preview.alreadyImported.toLocaleString(language)} já importadas · ${preview.duplicateRows.toLocaleString(language)} linhas repetidas agrupadas · ${preview.conflictingSourceIds.toLocaleString(language)} IDs de resposta conflitantes ignorados · ${preview.skippedInvalid.toLocaleString(language)} linhas inválidas · ${preview.unsupportedCategory.toLocaleString(language)} categorias não reconhecidas.`}</p>
        <p>{language === 'en'
          ? `${preview.matchedEvents.toLocaleString(language)} registrations linked to a unique existing event · ${preview.unmatchedEvents.toLocaleString(language)} without a unique event link (${preview.ambiguousEvents.toLocaleString(language)} ambiguous).`
          : `${preview.matchedEvents.toLocaleString(language)} inscrições vinculadas a um evento existente único · ${preview.unmatchedEvents.toLocaleString(language)} sem vínculo único (${preview.ambiguousEvents.toLocaleString(language)} ambíguas).`}</p>
        <p>{language === 'en'
          ? `${preview.unlinkedCustomerRegistrations.toLocaleString(language)} registrations have no safe customer key and will remain unlinked from customer records.`
          : `${preview.unlinkedCustomerRegistrations.toLocaleString(language)} inscrições não têm chave segura de cliente e permanecerão sem vínculo a fichas de clientes.`}</p>
        {(preview.conflictingSourceIds > 0 || preview.unmatchedEvents > 0 || preview.unsupportedCategory > 0 || preview.skippedInvalid > 0) && <p className='text-amber-700 dark:text-amber-300'>
          {language === 'en'
            ? 'Unmatched event labels will stay unlinked. Unsupported rows and conflicting IDs will be skipped.'
            : 'Eventos sem correspondência permanecerão sem vínculo. Categorias não reconhecidas e IDs conflitantes serão ignorados.'}
        </p>}
        <Button className='verdant-report-primary' onClick={() => void importFile()} disabled={importing || !serverConnected || !preview.registrations.length}>
          <Upload size={15} />
          {importing
            ? (language === 'en' ? 'Importing…' : 'Importando…')
            : language === 'en'
              ? `Add ${preview.readyRows.toLocaleString(language)} registrations`
              : `Adicionar ${preview.readyRows.toLocaleString(language)} inscrições`}
        </Button>
      </div>}
      {notice && <p role='status' className='rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'>{notice}</p>}
      {error && <p role='alert' className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>{error}</p>}
    </CardContent>
  </Card>
}

type PeopleSortKey = 'name' | 'phone' | 'email' | 'social' | 'events' | 'active'

function PeoplePage({ kind, data, update }: { kind: Person['kind']; data: VerdantState; update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean> }) {
  const [filters, setFilters] = useState({ name: '', phone: '', email: '', social: '', event: '', status: '' })
  const [sortKey, setSortKey] = useState<PeopleSortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const activeEvents = data.events.filter((event) => event.active).sort((a, b) => a.date.localeCompare(b.date))
  const allPeople = data.people.filter((person) => person.kind === kind)
  const filteredPeople = allPeople.filter((person) => {
    if (filters.name && !person.name.toLowerCase().includes(filters.name.toLowerCase())) return false
    if (filters.phone && !person.phone.toLowerCase().includes(filters.phone.toLowerCase())) return false
    if (filters.email && !person.email.toLowerCase().includes(filters.email.toLowerCase())) return false
    const social = kind === 'DJ' ? person.notes : person.instagram
    if (filters.social && !social.toLowerCase().includes(filters.social.toLowerCase())) return false
    if (filters.status === 'active' && !person.active) return false
    if (filters.status === 'inactive' && person.active) return false
    if (filters.event === 'linked' && !person.eventIds.some((id) => activeEvents.some((event) => event.id === id))) return false
    if (filters.event === 'unlinked' && person.eventIds.some((id) => activeEvents.some((event) => event.id === id))) return false
    if (filters.event && filters.event !== 'linked' && filters.event !== 'unlinked' && !person.eventIds.includes(filters.event)) return false
    return true
  })
  const people = sortRows(filteredPeople, (person) => {
    if (sortKey === 'social') return kind === 'DJ' ? person.notes : person.instagram
    if (sortKey === 'events') return person.eventIds.filter((id) => activeEvents.some((event) => event.id === id)).length
    return person[sortKey]
  }, sortDirection, getCurrentLanguage() === 'en' ? 'en' : 'pt-BR')
  const singular = kind === 'DJ' ? 'DJ' : 'Influencer'
  const toggleSort = (key: PeopleSortKey) => {
    setSortDirection((current) => key === sortKey && current === 'asc' ? 'desc' : 'asc')
    setSortKey(key)
  }

  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const name = String(values.get('name') ?? '').trim()
    if (!name) return
    const item: Person = { id: `${kind.toLowerCase()}-${Date.now().toString(36)}`, kind, name, phone: String(values.get('phone') ?? ''), email: String(values.get('email') ?? ''), instagram: String(values.get('instagram') ?? ''), notes: '', active: true, eventIds: [], eventDetails: {} }
    const saved = await update((state) => ({ ...state, people: [...state.people, item] }))
    if (!saved) return
    form.reset()
    toast.success(`${singular} cadastrado. Agora marque os eventos em que participará.`, { duration: 10000 })
  }

  return (
    <>
      <SectionHeading section={kind === 'DJ' ? 'djs' : 'influencers'} />
      <div className='verdant-catalog-intro'><div className='verdant-icon-tile'>{kind === 'DJ' ? <Headphones size={19} /> : <Megaphone size={19} />}</div><div><b>{<LocalizedText text={"Cadastro mestre"} />}</b><p>{<LocalizedText text={"Desvincular de uma data não exclui o cadastro. Profissionais inativos não aparecem em novos formulários."} />}</p></div><span>{allPeople.length} cadastrados</span></div>
      <Card>
        <CardHeader><CardTitle>Novo {singular}</CardTitle><CardDescription>{<LocalizedText text={"Nome obrigatório; contato e redes sociais são opcionais."} />}</CardDescription></CardHeader>
        <CardContent><form className='verdant-new-person' onSubmit={addPerson}><label className='verdant-field'>{<LocalizedText text={"Nome ou nome artístico"} />}<input name='name' required maxLength={120} placeholder='Nome para exibição' /></label><label className='verdant-field'>{<LocalizedText text={"WhatsApp"} />}<input name='phone' type='tel' placeholder='Com DDD' /></label><label className='verdant-field'>{<LocalizedText text={"E-mail"} />}<input name='email' type='email' placeholder='contato@exemplo.com' /></label><label className='verdant-field'>{<LocalizedText text={"Instagram"} />}<input name='instagram' placeholder='@perfil' /></label><Button type='submit'><Plus size={15} />{<LocalizedText text={"Cadastrar"} leadingSpace />}</Button></form></CardContent>
      </Card>
      <div className='verdant-list-heading'><h2>{<LocalizedText text={"Profissionais cadastrados"} />}</h2><span>{people.length} {<LocalizedText text={"exibidos"} />}</span></div>
      <div className='verdant-column-filter-bar' aria-label={getCurrentLanguage() === 'en' ? 'Filter professionals by column' : 'Filtrar profissionais por coluna'}>
        <ColumnFilterControl label='Nome' placeholder={`Buscar ${singular.toLowerCase()}`} value={filters.name} onChange={(value) => setFilters((current) => ({ ...current, name: value }))} />
        <ColumnFilterControl label='WhatsApp' placeholder='Filtrar telefone' value={filters.phone} onChange={(value) => setFilters((current) => ({ ...current, phone: value }))} />
        <ColumnFilterControl label='E-mail' placeholder='Filtrar e-mail' value={filters.email} onChange={(value) => setFilters((current) => ({ ...current, email: value }))} />
        <ColumnFilterControl label={kind === 'DJ' ? 'Observações / pista' : 'Instagram'} placeholder={kind === 'DJ' ? 'Filtrar observações' : 'Filtrar perfil'} value={filters.social} onChange={(value) => setFilters((current) => ({ ...current, social: value }))} />
        <ColumnFilterControl label='Eventos vinculados' value={filters.event} onChange={(value) => setFilters((current) => ({ ...current, event: value }))} options={[{ value: '', label: 'Todos os eventos' }, { value: 'linked', label: 'Com evento vinculado' }, { value: 'unlinked', label: 'Sem evento vinculado' }, ...activeEvents.map((event) => ({ value: event.id, label: event.name }))]} />
        <ColumnFilterControl label='Status' value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} options={[{ value: '', label: 'Todos os status' }, { value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }]} />
      </div>
      <div className='verdant-person-table-scroll'>
        <div className='verdant-person-table'>
          <div className='verdant-person-sort-header'>
            <SortButton label={<LocalizedText text='Nome' />} active={sortKey === 'name'} direction={sortDirection} onClick={() => toggleSort('name')} />
            <SortButton label={<LocalizedText text='WhatsApp' />} active={sortKey === 'phone'} direction={sortDirection} onClick={() => toggleSort('phone')} />
            <SortButton label={<LocalizedText text='E-mail' />} active={sortKey === 'email'} direction={sortDirection} onClick={() => toggleSort('email')} />
            <SortButton label={kind === 'DJ' ? 'Observações / pista' : <LocalizedText text='Instagram' />} active={sortKey === 'social'} direction={sortDirection} onClick={() => toggleSort('social')} />
            <SortButton label={<LocalizedText text='Eventos' />} active={sortKey === 'events'} direction={sortDirection} onClick={() => toggleSort('events')} />
            <SortButton label={<LocalizedText text='Status' />} active={sortKey === 'active'} direction={sortDirection} onClick={() => toggleSort('active')} />
          </div>
          <div className='verdant-person-list'>{people.map((person) => <PersonEditor key={person.id} person={person} events={data.events} people={data.people} update={update} />)}</div>
        </div>
      </div>
      {!people.length && <div className='verdant-empty-state'>{<LocalizedText text={"Nenhum cadastro encontrado."} />}</div>}
    </>
  )
}

function PersonEditor({ person, events, people, update }: { person: Person; events: VerdantEvent[]; people: Person[]; update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean> }) {
  const [active, setActive] = useState(person.active)
  const [eventIds, setEventIds] = useState(person.eventIds)
  const [details, setDetails] = useState<Record<string, EventDetails>>(person.eventDetails ?? {})
  const [profile, setProfile] = useState({ name: person.name, phone: person.phone, email: person.email, instagram: person.instagram, notes: person.notes, pixKey: person.pixKey || '', beneficiaryName: person.beneficiaryName || '' })
  // Rehydrate editable fields when a different professional record is selected.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(person.active)
    setEventIds(person.eventIds)
    setDetails(person.eventDetails ?? {})
    setProfile({ name: person.name, phone: person.phone, email: person.email, instagram: person.instagram, notes: person.notes, pixKey: person.pixKey || '', beneficiaryName: person.beneficiaryName || '' })
  }, [person])
  const linkedCount = eventIds.filter((id) => events.some((event) => event.id === id && event.active)).length

  function toggleEvent(id: string) {
    const adding = !eventIds.includes(id)
    setEventIds((current) => adding ? [...current, id] : current.filter((value) => value !== id))
    const nextOrder = people.filter((item) => item.id !== person.id && item.kind === person.kind && item.active && item.eventIds.includes(id)).length + 1
    setDetails((current) => ({ ...current, [id]: current[id] ?? { track: '', time: '', order: nextOrder } }))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await update((state) => ({
      ...state,
      people: state.people.map((item) => item.id === person.id ? { ...item, ...profile, active, eventIds, eventDetails: details } : item),
    }))
    if (saved) toast.success('Cadastro e vínculos salvos.', { duration: 10000 })
  }

  return (
    <details className='verdant-person-card'>
      <summary>
        <span className='verdant-person-primary'><span className='verdant-person-avatar'>{person.name.slice(0, 1).toUpperCase()}</span><span className='verdant-person-name'><b>{person.name}</b></span></span>
        <span className='verdant-person-cell'>{person.phone || '—'}</span>
        <span className='verdant-person-cell'>{person.email || '—'}</span>
        <span className='verdant-person-cell'>{(person.kind === 'DJ' ? person.notes : person.instagram) || '—'}</span>
        <span className='verdant-person-cell'>{linkedCount}</span>
        <span className={`verdant-status ${person.active ? 'is-open' : ''}`}>{person.active ? 'Ativo' : 'Inativo'}</span>
      </summary>
      <form className='verdant-person-form' onSubmit={save}>
        <div className='verdant-config-fields'>
          <label className='verdant-field'>{<LocalizedText text={"Nome / nome artístico"} />}<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></label>
          <label className='verdant-field'>{<LocalizedText text={"WhatsApp"} />}<input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
          <label className='verdant-field'>{<LocalizedText text={"E-mail"} />}<input type='email' value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label>
          <label className='verdant-field'>{person.kind === 'DJ' ? 'Observações / pista' : 'Instagram'}<input value={person.kind === 'DJ' ? profile.notes : profile.instagram} onChange={(e) => setProfile({ ...profile, [person.kind === 'DJ' ? 'notes' : 'instagram']: e.target.value })} /></label>
          <label className='verdant-field'>Chave Pix<input value={profile.pixKey} maxLength={254} onChange={(e) => setProfile({ ...profile, pixKey: e.target.value })} /></label>
          <label className='verdant-field'>Beneficiário do Pix<input value={profile.beneficiaryName} maxLength={254} onChange={(e) => setProfile({ ...profile, beneficiaryName: e.target.value })} /></label>
          <label className='verdant-switch-line'><input type='checkbox' checked={active} onChange={(e) => setActive(e.target.checked)} /><span>{<LocalizedText text={"Cadastro ativo"} />}</span></label>
        </div>
        <div className='verdant-link-editor'><div><b>{person.kind === 'DJ' ? 'DJs deste evento' : 'Influencers deste evento'}</b><small>{<LocalizedText text={"A seleção é independente; nada é copiado automaticamente entre datas."} />}</small></div>
          {events.filter((event) => event.active).sort((a, b) => a.date.localeCompare(b.date)).map((event) => {
            const selected = eventIds.includes(event.id)
            const detail = details[event.id] ?? { track: '', time: '', order: 1 }
            return <div className={`verdant-link-row ${selected ? 'selected' : ''}`} key={event.id}>
              <label className='verdant-link-check'><input type='checkbox' checked={selected} onChange={() => toggleEvent(event.id)} /><span><b>{event.name}</b><small>{compactDate(event.date)}</small></span></label>
              {selected && <div className='verdant-link-fields'>
                {person.kind === 'DJ' && <label className='verdant-field'>{<LocalizedText text={"Pista"} />}<input value={detail.track} onChange={(e) => setDetails({ ...details, [event.id]: { ...detail, track: e.target.value } })} placeholder='Pista / ambiente' /></label>}
                <label className='verdant-field'>{<LocalizedText text={"Horário"} />}<input type='time' value={detail.time} onChange={(e) => setDetails({ ...details, [event.id]: { ...detail, time: e.target.value } })} /></label>
                <label className='verdant-field'>{<LocalizedText text={"Ordem"} />}<input type='number' min='1' value={detail.order} onChange={(e) => setDetails({ ...details, [event.id]: { ...detail, order: Number(e.target.value) } })} /></label>
              </div>}
            </div>
          })}
        </div>
        <div className='verdant-config-footer'><span /><Button type='submit' size='sm'>{<LocalizedText text={"Salvar cadastro e vínculos"} />}</Button></div>
      </form>
    </details>
  )
}

function BirthdayGuestList({ guests }: { guests: unknown }) {
  const names = birthdayGuestNames(guests)
  const english = getCurrentLanguage() === 'en'
  return <div className='space-y-1'><b className='text-xs'>{names.length} {english ? 'guests' : 'convidados'}</b><ol className='list-decimal space-y-1 ps-5'>{names.map((name, index) => <li key={index}>{name}</li>)}</ol><p className='text-xs text-muted-foreground'>{english ? `Including birthday person: ${names.length + 1} people` : `Com aniversariante: ${names.length + 1} pessoas`}</p></div>
}

type PrintReport = 'portaria' | 'leads' | 'djs' | 'line' | 'influencers' | 'geral'

const letterheadOptions = [
  { id: '', label: 'Sem timbrado', image: '' },
  { id: 'variacao-1', label: 'Modelo 1 · faixa superior tricolor', image: '/images/timbrado-variacao-1.jpg' },
  { id: 'variacao-2', label: 'Modelo 2 · logo central', image: '/images/timbrado-variacao-2.jpg' },
  { id: 'variacao-3', label: 'Modelo 3 · faixa compacta', image: '/images/timbrado-variacao-3.jpg' },
  { id: 'variacao-4', label: 'Modelo 4 · logo à direita', image: '/images/timbrado-variacao-4.jpg' },
]

function portariaSections(data: VerdantState, eventId: string): PortariaSection[] {
  const eventRows = visibleRegistrations(data).filter((row) => row.eventId === eventId)
  const definitions: { key: FormKey; title: string }[] = [
    { key: 'VIP', title: 'LISTA VIP' },
    { key: 'INFLUENCIADORES', title: 'LISTA INFLUENCERS' },
    { key: 'ANIVERSARIO', title: 'LISTA ANIVERSÁRIO' },
    { key: 'DJS', title: 'LISTA DJS' },
    { key: 'LISTA_LOVERS', title: 'LISTA AMIGA' },
  ]
  return definitions.flatMap(({ key, title }) => {
    const rows = eventRows.filter((row) => row.formKey === key)
    if (!rows.length) return []
    const config = data.forms.find((item) => item.key === key && item.eventId === eventId)
    const price = key === 'ANIVERSARIO'
      ? config?.guestPriceMode === 'PORTARIA' ? 'valor da portaria' : money(config?.guestPrice ?? 0)
      : money(config?.price ?? 0)
    const hours = config?.start ? ` DAS ${config.start.slice(0, 2)}H ATÉ ${config.end.slice(0, 2)}H` : ''
    const consumptionLabel = config?.consumption && !(key === 'ANIVERSARIO' && config.guestPriceMode === 'PORTARIA') ? ' CONSUMAÇÃO' : ''
    const detail = key === 'VIP'
      ? config?.openBarTime ? ` · ${config.openBarTime}` : ' · entrada gratuita após o Open Bar'
      : config
        ? ` (${price}${consumptionLabel})${hours}`
        : ''
    if (key === 'ANIVERSARIO') return [{
      title: `${title}${detail}`,
      groups: rows.map((row) => birthdayDoorGroup(row.name, row.guestNames)),
    }]
    if (key === 'DJS' || key === 'INFLUENCIADORES') {
      const grouped = new Map<string, string[]>()
      rows.forEach((row) => {
        const label = data.people.find(person => person.id === row.optionId && person.kind === (key === 'DJS' ? 'DJ' : 'INFLUENCIADORES'))?.name || row.optionName || 'Profissional não informado'
        grouped.set(label, [...(grouped.get(label) ?? []), row.name])
      })
      return [{ title: `${title}${detail}`, groups: [...grouped].map(([label, names]) => ({ label, names })) }]
    }
    if (key === 'VIP') {
      const grouped = new Map<string, string[]>()
      rows.forEach((row) => {
        const label = row.profileType || 'Inclusão VIP'
        grouped.set(label, [...(grouped.get(label) ?? []), row.name])
      })
      return [{ title: `${title}${detail}`, groups: [...grouped].map(([label, names]) => ({ label, names })) }]
    }
    return [{ title: `${title}${detail}`, groups: [{ label: '', names: rows.map((row) => row.name) }] }]
  })
}

function reportPeople(data: VerdantState, kind: Person['kind']) {
  return data.people.filter((person) => person.kind === kind && person.active).flatMap((person) => person.eventIds.map((id) => {
    const relatedEvent = eventById(data, id)
    const detail = person.eventDetails[id] ?? { track: '', time: '', order: 0 }
    return { person, relatedEvent, detail }
  })).filter((row) => row.relatedEvent).sort((a, b) => `${a.relatedEvent?.date}${String(a.detail.order).padStart(3, '0')}`.localeCompare(`${b.relatedEvent?.date}${String(b.detail.order).padStart(3, '0')}`))
}

export function VerdantReports({ data, embedded = false }: { data: VerdantState; embedded?: boolean }) {
  const admin = useAuthStore(state => state.auth.user?.role.includes('admin'))
  const [eventId, setEventId] = useState(() => new URLSearchParams(window.location.search).get('event') || data.events.find((event) => event.active)?.id || '')
  const [lineSort, setLineSort] = useState<'order' | 'time'>('order')
  const lineRows = djLineRows(data, eventId, lineSort)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfDownload, setPdfDownload] = useState<{ url: string; filename: string; eventId: string; label: string } | null>(null)
  const autoGenerateRef = useRef(false)
  useEffect(() => () => { if (pdfDownload) URL.revokeObjectURL(pdfDownload.url) }, [pdfDownload])
  const update = useVerdantStore((state) => state.update)
  const event = eventById(data, eventId)
  const sections = portariaSections(data, eventId)
  const doorCsvRows = sections.flatMap((section) => section.groups.flatMap((group) => [...(group.hostName ? [[section.title, 'Aniversariante', group.hostName]] : []), ...group.names.map((name) => [section.title, group.label, name])]))
  const activeLetterhead = letterheadOptions.find((item) => item.id === (event?.letterheadId ?? '')) ?? letterheadOptions[0]
  const djRows = reportPeople(data, 'DJ').filter((row) => row.relatedEvent?.id === eventId)
  const influencerRows = reportPeople(data, 'INFLUENCIADORES').filter((row) => row.relatedEvent?.id === eventId)
  const leads = visibleRegistrations(data).filter((row) => row.consent && row.eventId === eventId)

  async function downloadReportPdf(kind: PrintReport = 'portaria') {
    if ((!event && kind !== 'geral') || pdfBusy) return
    setPdfBusy(true)
    try {
      const label = { portaria: 'Lista de portaria', djs: 'Lista de DJs', line: 'Line de DJs', influencers: 'Lista de Influencers', leads: 'Leads com consentimento', geral: 'Lista geral' }[kind]
      let reportSections = sections
      if (kind === 'djs' || kind === 'influencers') {
        const formKey = kind === 'djs' ? 'DJS' : 'INFLUENCIADORES'
        const professionals = kind === 'djs' ? djRows : influencerRows
        reportSections = professionalDoorList(kind === 'djs' ? 'DJs' : 'Influencers', kind === 'djs' ? lineRows.map(row => row.name) : professionals.map(({ person }) => person.name), kind === 'djs' ? djGuests(data, eventId).map(row => ({ professional: row.professional, name: row.name })) : visibleRegistrations(data).filter(row => row.eventId === eventId && row.formKey === formKey).map(row => ({ professional: row.optionName || '', name: row.name })))
      } else if (kind === 'line') {
        reportSections = djLineSections(lineRows)
      } else if (kind === 'leads') {
        reportSections = leads.length ? [{ title: 'Contatos com consentimento', groups: leads.map(row => ({ label: row.name, names: [row.whatsapp, row.email].filter(Boolean) })) }] : []
      } else if (kind === 'geral') {
        reportSections = data.events.filter(item => item.active).flatMap(item => portariaSections(data, item.id).map(section => ({ ...section, title: `${item.name} - ${compactDate(item.date)} - ${section.title}` })))
      }
      const { createPortariaPdf } = await import('./portaria-pdf')
      let letterhead: Uint8Array | undefined
      if (activeLetterhead.image) {
        const response = await fetch(activeLetterhead.image)
        if (!response.ok) throw new Error('Não foi possível carregar o timbrado. Tente novamente.')
        letterhead = new Uint8Array(await response.arrayBuffer())
      }
      const bytes = await createPortariaPdf({ eventName: kind === 'geral' ? 'Todos os eventos ativos' : event!.name, eventDate: kind === 'geral' ? '' : compactDate(event!.date), sections: reportSections, letterhead, reportLabel: label })
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
      const filename = `verdant-${kind}-${kind === 'geral' ? 'todos-eventos' : event!.date}.pdf`
      setPdfDownload({ url, filename, eventId, label })
      const link = document.createElement('a')
      link.href = url; link.download = filename
      document.body.append(link); link.click(); link.remove()
      toast.success('PDF gerado. Se o download não iniciar, use o link abaixo dos relatórios.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o PDF. Tente novamente.')
    } finally { setPdfBusy(false) }
  }

  useEffect(() => {
    if (autoGenerateRef.current || !event) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('generate') !== 'portaria') return
    autoGenerateRef.current = true
    const closeAfter = params.get('close') === '1'
    params.delete('generate')
    params.delete('close')
    const query = params.toString()
    window.history.replaceState(null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname)
    void Promise.resolve().then(() => downloadReportPdf('portaria')).finally(() => {
      if (closeAfter) window.setTimeout(() => window.close(), 700)
    })
  }, [event])

  async function saveLetterhead(value: string) {
    if (!event) return
    const saved = await update((state) => ({ ...state, events: state.events.map((item) => item.id === event.id ? { ...item, letterheadId: value as VerdantEvent['letterheadId'] } : item) }))
    if (saved) toast.success('Timbrado do evento salvo.', { duration: 10000 })
  }

  function exportLeads() {
    const rows = leads.map((row) => [row.name, row.whatsapp, row.email, compactDate(row.eventDate), row.eventName])
    csvDownload(`verdant-leads-${event?.date ?? 'evento'}.csv`, [['Nome', 'WhatsApp', 'E-mail', 'Data', 'Evento'], ...rows])
  }

  const generalRows = sortRows(visibleRegistrations(data), (row) => `${data.events.find((item) => item.id === row.eventId)?.date ?? row.eventDate}|${row.formKey}|${row.name}`, 'asc')

  function exportGeneral() {
    const rows = generalRows
      .map((row) => [compactDate(row.eventDate), row.eventName, formTitle(row.formKey), row.name, row.whatsapp, row.email, row.optionName, row.profileType, row.guestNames.join('; '), row.consent ? 'Sim' : 'Não', row.status, row.createdAt])
    csvDownload('verdant-lista-geral.csv', [['Data', 'Evento', 'Lista', 'Nome', 'WhatsApp', 'E-mail', 'Opção / profissional', 'Perfil', 'Convidados', 'Consentimento', 'Status', 'Inscrito em'], ...rows])
  }

  function exportPeople(kind: Person['kind']) {
    if (kind === 'DJ') {
      csvDownload(`verdant-djs-inscritos-${event?.date || 'evento'}.csv`, [['Data', 'Evento', 'DJ', 'Inscrito'], ...djGuests(data, eventId).map(row => [compactDate(event?.date || row.eventDate), event?.name || row.eventName, row.professional, row.name])])
      return
    }
    const rows = reportPeople(data, kind).filter((row) => row.relatedEvent?.id === eventId)
    const rowsCsv = rows.map(({ person, relatedEvent, detail }) => [compactDate(relatedEvent?.date ?? ''), relatedEvent?.name ?? '', detail.track, detail.order, detail.time, person.name, person.phone, person.email, person.instagram])
    csvDownload('verdant-relatorio-influencers.csv', [['Data', 'Evento', 'Pista', 'Ordem', 'Horário', 'Profissional', 'WhatsApp', 'E-mail', 'Instagram'], ...rowsCsv])
  }

  return (
    <>
      {embedded ? <div className='verdant-page-heading'><div><div className='verdant-eyebrow'>{<LocalizedText text={"CENTRAL VERDANT"} />}</div><h2>{<LocalizedText text={"Relatórios"} />}</h2><p>{<LocalizedText text={"Imprima ou salve em PDF, ou exporte os dados em CSV."} />}</p></div></div> : <SectionHeading section='exportacoes' />}
      <Card className='mb-4'><CardHeader><CardTitle>{<LocalizedText text={"Evento e timbrado"} />}</CardTitle><CardDescription>{<LocalizedText text={"Selecione uma data. A escolha aplica-se a todos os relatórios abaixo e fica salva no evento."} />}</CardDescription></CardHeader><CardContent className='grid gap-3 sm:grid-cols-2'><label className='verdant-field'>{<LocalizedText text={"Evento"} />}<select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value=''>{<LocalizedText text={"Selecione um evento"} />}</option>{data.events.filter((item) => item.active).sort((a, b) => a.date.localeCompare(b.date)).map((item) => <option key={item.id} value={item.id}>{compactDate(item.date)} · {item.name}</option>)}</select></label>{event && <label className='verdant-field'>{<LocalizedText text={"Timbrado deste evento"} />}<select value={event.letterheadId ?? ''} onChange={(e) => saveLetterhead(e.target.value)}>{letterheadOptions.map((item) => <option key={item.id || 'none'} value={item.id}>{item.label}</option>)}</select></label>}</CardContent></Card>
      {event && <DjLineEditor key={`${eventId}-${data.revision}`} data={data} eventId={eventId} update={update} />}
      <details className='mb-4 rounded-lg border p-4'><summary className='cursor-pointer font-semibold'>Histórico e PDFs de escalas</summary><div className='mt-4'><RostersPage data={data} historyOnly /></div></details>
      <div className='verdant-export-grid'>
        <Card className='verdant-export-card'><CardHeader><div className='verdant-export-icon'><Printer size={18} /></div><CardTitle>{<LocalizedText text={"Lista de portaria"} />}</CardTitle><CardDescription>{<LocalizedText text={"Nomes inscritos no evento, organizados por lista e profissional."} />}</CardDescription></CardHeader><CardContent><div className='verdant-export-count'>{doorCsvRows.length}<small>{<LocalizedText text={"nomes na lista"} />}</small></div><div className='verdant-export-actions'><Button className='verdant-report-primary' onClick={() => { void downloadReportPdf() }} disabled={!event || pdfBusy}><Printer size={15} />{<LocalizedText text={pdfBusy ? "Gerando PDF…" : "Gerar PDF"} leadingSpace />}</Button><Button variant='outline' onClick={() => csvDownload(`verdant-portaria-${event?.date ?? 'evento'}.csv`, [['Lista', 'Profissional / categoria', 'Nome'], ...doorCsvRows])} disabled={!event}><ArrowDownToLine size={15} />{<LocalizedText text={"Exportar CSV"} leadingSpace />}</Button></div></CardContent></Card>
        <ReportExportCard icon={<FileSpreadsheet size={18} />} title='Lista geral (todos os eventos)' description='Todas as inscrições de todos os eventos ativos, em um único CSV.' count={visibleRegistrations(data).length} countLabel='inscrições'         onPrint={() => { void downloadReportPdf('geral') }} disabled={pdfBusy} onCsv={exportGeneral} />
        <ReportExportCard icon={<FileSpreadsheet size={18} />} title='Leads com consentimento' description='Contatos que aceitaram novidades: nome, WhatsApp e e-mail.' count={leads.length} countLabel='contatos autorizados' onPrint={() => { void downloadReportPdf('leads') }} onCsv={exportLeads} disabled={!event || pdfBusy} />
        <ReportExportCard icon={<Music2 size={18} />} title='Lista de DJs' description='Inscritos agrupados pelo DJ, também incluídos no relatório geral. PDF e CSV de convidados.' count={djGuests(data, eventId).length} countLabel='inscritos vinculados aos DJs' onPrint={() => { void downloadReportPdf('djs') }} onCsv={() => exportPeople('DJ')} disabled={!event || pdfBusy} />
        <Card className='verdant-export-card'><CardHeader><CardTitle>Line de DJs</CardTitle><CardDescription>Escala da noite por pista, com ordem e horários. Os inscritos ficam na Lista de DJs e no relatório geral.</CardDescription></CardHeader><CardContent><label className='verdant-field'>Organizar impressão<select value={lineSort} onChange={e => setLineSort(e.target.value as 'order' | 'time')}><option value='order'>Ordem 1, 2, 3… por pista</option><option value='time'>Horário da noite por pista</option></select></label><div className='verdant-export-actions'><Button disabled={!event || pdfBusy || !lineRows.length} onClick={() => void downloadReportPdf('line')}>Gerar PDF da line</Button><Button variant='outline' disabled={!event || !lineRows.length} onClick={() => csvDownload(`verdant-line-djs-${event?.date || 'evento'}.csv`, [['Data', 'Evento', 'Pista', 'Ordem', 'DJ', 'Horário'], ...lineRows.map(row => [event?.date || '', event?.name || '', row.track, String(row.order), row.name, row.time])])}>Exportar CSV da line</Button></div></CardContent></Card>
        <ReportExportCard icon={<Megaphone size={18} />} title='Lista de Influencers' description='PDF com os nomes dos Influencers e seus convidados, agrupados por profissional.' count={influencerRows.length} countLabel='Influencers vinculados' onPrint={() => { void downloadReportPdf('influencers') }} onCsv={() => exportPeople('INFLUENCIADORES')} disabled={!event || pdfBusy} />
      </div>
      {admin && <InfluencerPayoutReportPanel eventId={eventId || undefined} />}
      {pdfDownload?.eventId === eventId && <a className='mt-3 inline-flex min-h-11 items-center text-sm underline' href={pdfDownload.url} download={pdfDownload.filename}>Baixar PDF — {pdfDownload.label}</a>}

    </>
  )
}

function ReportExportCard({ icon, title, description, count, countLabel, onPrint, onCsv, disabled = false }: { icon: React.ReactNode; title: string; description: string; count: number; countLabel: string; onPrint: () => void; onCsv: () => void; disabled?: boolean }) {
  const { translate } = useLanguage()
  return <Card className='verdant-export-card'><CardHeader><div className='verdant-export-icon'>{icon}</div><CardTitle>{translate(title)}</CardTitle><CardDescription>{translate(description)}</CardDescription></CardHeader><CardContent><div className='verdant-export-count'>{count}<small>{translate(countLabel)}</small></div><div className='verdant-export-actions'><Button className='verdant-report-primary' onClick={onPrint} disabled={disabled}><Printer size={15} />{<LocalizedText text={"Gerar PDF"} leadingSpace />}</Button><Button variant='outline' onClick={onCsv} disabled={disabled}><ArrowDownToLine size={15} />{<LocalizedText text={"Exportar CSV"} leadingSpace />}</Button></div></CardContent></Card>
}

function ExportsPage({ data }: { data: VerdantState }) {
  return <VerdantReports data={data} />
}

function SettingsPage({ data }: { data: VerdantState }) {
  const serverConnected = useVerdantStore((state) => state.serverConnected)
  const count = data.forms.length
  return (
    <>
      <SectionHeading section='configuracoes' />
      <div className='verdant-settings-grid'>
        <Card><CardHeader><div className='verdant-export-icon'><Clock3 size={18} /></div><CardTitle>{<LocalizedText text={"Horários e fuso"} />}</CardTitle><CardDescription>{<LocalizedText text={"Horários dos eventos e formulários são configurados por data."} />}</CardDescription></CardHeader><CardContent className='verdant-setting-content'><p><b>{<LocalizedText text={"Fuso padrão:"} />}</b>{<LocalizedText text={"Curitiba · America/Sao_Paulo"} leadingSpace />}</p><p><b>{<LocalizedText text={"Abertura de referência:"} />}</b>{<LocalizedText text={"terça-feira às 20h"} leadingSpace />}</p><p><b>{<LocalizedText text={"Encerramento padrão:"} />}</b>{<LocalizedText text={"19h no dia do evento"} leadingSpace />}</p><p><b>{<LocalizedText text={"Aniversário:"} />}</b>{<LocalizedText text={"15h no dia do evento"} leadingSpace />}</p><p>{<LocalizedText text={"Cada regra pode ser ajustada individualmente na área Formulários."} />}</p><Button asChild variant='outline'><Link to='/verdant/formularios'><Settings2 size={15} />{<LocalizedText text={"Configurar datas e regras"} leadingSpace />}</Link></Button></CardContent></Card>
        <Card><CardHeader><div className='verdant-export-icon'><Heart size={18} /></div><CardTitle>{<LocalizedText text={"Integração e armazenamento"} />}</CardTitle><CardDescription>{<LocalizedText text={"Estado atual da base de operação."} />}</CardDescription></CardHeader><CardContent className='verdant-setting-content'><div className={`verdant-connection ${serverConnected ? 'online' : ''}`}><span className='verdant-dot' />{serverConnected ? 'Servidor conectado' : 'Servidor desconectado'}</div><p>{serverConnected ? 'Alterações e inscrições são gravadas na base do servidor.' : 'Os dados não estão disponíveis agora e não podem ser editados. Verifique a implantação da API.'}</p><p><b>{count}</b>{<LocalizedText text={"configurações de formulário ·"} leadingSpace trailingSpace />}<b>{data.people.length}</b>{<LocalizedText text={"profissionais ·"} leadingSpace trailingSpace />}<b>{visibleRegistrations(data).length}</b>{<LocalizedText text={"inscrições"} leadingSpace />}</p></CardContent></Card>
        <Card><CardHeader><div className='verdant-export-icon'><AtSign size={18} /></div><CardTitle>{<LocalizedText text={"Tráfego do site e Meta"} />}</CardTitle><CardDescription>{<LocalizedText text={"As áreas atuais do painel foram mantidas."} />}</CardDescription></CardHeader><CardContent className='verdant-setting-content'><p>{<LocalizedText text={"Use a navegação original para conectar ou acompanhar as fontes que já estavam no painel. A operação de listas fica separada, em"} trailingSpace />}<b>{<LocalizedText text={"Verdant · Operação"} />}</b>.</p><p>{<LocalizedText text={"Conectar Meta ou Analytics depende das credenciais e permissões configuradas na própria integração."} />}</p><Button asChild variant='outline'><Link to='/apps'>{<LocalizedText text={"Abrir Apps"} />}</Link></Button></CardContent></Card>
      </div>
    </>
  )
}
