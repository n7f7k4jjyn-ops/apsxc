import { useIsMobile } from '@/hooks/use-mobile'
import { MonthFilter } from '@/features/verdant/month-filter'
import { monthRange } from '@/features/verdant/month-range'
import { FitValue } from '@/components/fit-value'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { FinancialSummary } from './financial-summary'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  RefreshCw,
  UsersRound,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { EmptyEvents, PageError, PageLoading } from '@/components/page-state'
import { trackNavigation } from '@/lib/analytics'
import { formatDate, type FormKey } from '@/features/verdant/data'
import { useVerdantStore } from '@/features/verdant/store'
import './mobile.css'
import { buildWorkflow, periodKeys, timeZone, type Period, type DateRange } from './workflow'

const slug: Record<FormKey, string> = {
  DJS: 'djs',
  INFLUENCIADORES: 'influencers',
  LISTA_LOVERS: 'lovers',
  VIP: 'vip',
  ANIVERSARIO: 'aniversario',
  ENTRADA_GRATUITA: 'entrada-gratuita',
}
const listLabels = {
  open: 'Aberta',
  closed: 'Encerrada',
  scheduled: 'Agendada',
  disabled: 'Desativada',
  invalid: 'Revisar horários',
}
type ExtraSummary = {
  jobApplications: number
  teamRegistrations: number | null
  tasks: {
    pending: number
    overdue: number
    items: { id: string; title: string; dueDate: string; priority: string }[]
  }
  updatedAt: string
}

export function Dashboard() {
  const admin = useAuthStore(state => state.auth.user?.role.includes('admin'))
  const { data, initialize } = useVerdantStore()
  const mobile = useIsMobile()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [summary, setSummary] = useState<'operation' | 'finance'>('operation')
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer) }, [])
  const [period, setPeriod] = useState<Period>('week')
  const [focusId, setFocusId] = useState('all')
  const [customRange, setCustomRange] = useState<DateRange>({ from: '', to: '' })
  const [rangeActive, setRangeActive] = useState(false)
  let rangeError = ''
  if (rangeActive) { try { periodKeys(now, period, customRange) } catch (error) { rangeError = (error as Error).message } }
  const range = rangeActive && !rangeError ? customRange : undefined
  useEffect(() => { void initialize() }, [initialize])
  const summarySwitch = <>
    <nav aria-label='Tipo de resumo' className='flex flex-wrap gap-2'>
      <Button variant={summary === 'operation' ? 'default' : 'outline'} aria-pressed={summary === 'operation'} onClick={() => setSummary('operation')}>Resumo da operação</Button>
      {admin && <Button variant={summary === 'finance' ? 'default' : 'outline'} aria-pressed={summary === 'finance'} onClick={() => setSummary('finance')}>Resumo financeiro</Button>}
    </nav>
    <details className='summary-filters rounded-xl border bg-card p-4' aria-label='Filtros do resumo' open={!mobile || mobileFiltersOpen} onToggle={event => { if (mobile) setMobileFiltersOpen(event.currentTarget.open) }}><summary className='flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2'><h2 className='text-sm font-semibold'>Evento e período</h2><span className='text-xs text-muted-foreground'>{focusId === 'all' ? 'Todos os eventos' : focusId === 'next' ? 'Próximo evento' : data.events.find(event => event.id === focusId)?.name} · {rangeActive ? `${customRange.from} → ${customRange.to}` : { day: 'Hoje', week: 'Esta semana', month: 'Este mês' }[period]}</span></summary><div className='summary-main-filters mt-3'>
      <label className='grid min-w-0 flex-1 gap-1 text-sm'>Evento em foco<select className='h-11 rounded-md border bg-background px-3' value={focusId} onChange={e => setFocusId(e.target.value)}><option value='next'>Próximo evento</option><option value='all'>Todos os eventos</option>{[...data.events].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)).map(event => <option key={event.id} value={event.id}>{event.date.split('-').reverse().join('/')} · {event.name}</option>)}</select></label>
      <MonthFilter value={rangeActive && customRange.from.endsWith('-01') && monthRange(customRange.from.slice(0, 7)).to === customRange.to ? customRange.from.slice(0, 7) : ''} onChange={value => { if (!value) { setRangeActive(false); return }; setCustomRange(monthRange(value)); setRangeActive(true); setFocusId('all') }} />
      <div><p className='mb-1 text-sm'>Período</p><div className='flex gap-1'>{(['day', 'week', 'month'] as const).map(value => <Button key={value} size='sm' variant={!rangeActive && period === value ? 'secondary' : 'ghost'} aria-pressed={!rangeActive && period === value} onClick={() => { setPeriod(value); setRangeActive(false) }}>{{day:'Hoje', week:'Esta semana', month:'Este mês'}[value]}</Button>)}</div></div>
      </div><details className='summary-custom-period mt-3'><summary className='cursor-pointer text-sm text-muted-foreground'>Personalizar período</summary><div className='mt-3 grid gap-3 sm:grid-cols-2'>
      <label className='grid gap-1 text-sm'>Data inicial<input className='h-11 rounded-md border bg-background px-3' type='date' value={rangeActive ? customRange.from : periodKeys(now, period)[0]} onChange={e => { const value = e.target.value; setCustomRange(current => ({ from: value, to: rangeActive ? current.to : periodKeys(now, period)[periodKeys(now, period).length - 1] })); setRangeActive(true) }} /></label>
      <label className='grid gap-1 text-sm'>Data final<input className='h-11 rounded-md border bg-background px-3' type='date' value={rangeActive ? customRange.to : periodKeys(now, period)[periodKeys(now, period).length - 1]} onChange={e => { const value = e.target.value; setCustomRange(current => ({ from: rangeActive ? current.from : periodKeys(now, period)[0], to: value })); setRangeActive(true) }} /></label>
    </div></details></details>
  </>
  if (rangeError) return <><Header fixed /><Main className='space-y-4'>{summarySwitch}<p role='alert'>{rangeError}</p></Main></>
  return admin && summary === 'finance' ? <FinancialSummary summarySwitch={summarySwitch} period={period} focusId={focusId} now={now} range={range} /> : <OperationsDashboard summarySwitch={summarySwitch} period={period} focusId={focusId} range={range} onFocusEvent={setFocusId} />
}

function OperationsDashboard({ summarySwitch, period, focusId, range, onFocusEvent }: { summarySwitch: ReactNode; period: Period; focusId: string; range?: DateRange; onFocusEvent: (eventId: string) => void }) {
  const { translate } = useLanguage()
  const { data, ready, serverConnected, initialize, refresh } =
    useVerdantStore()
  const [now, setNow] = useState(Date.now)
  const [extra, setExtra] = useState<ExtraSummary | null>(null)
  const [extraError, setExtraError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const workflow = useMemo(
    () => buildWorkflow(data, now, period, focusId, range),
    [data, now, period, focusId, range]
  )
  const recordsHref = workflow.event
    ? `/verdant/inscricoes?event=${encodeURIComponent(workflow.event.id)}`
    : '/verdant/inscricoes'
  const reportsHref = workflow.event
    ? `/verdant/exportacoes?event=${encodeURIComponent(workflow.event.id)}&generate=portaria&close=1`
    : '/verdant/exportacoes'
  const clock = (value: number) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)
  const fmtCount = (value: number) =>
    ready && serverConnected ? value.toLocaleString('pt-BR') : '—'

  const loadExtra = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/dashboard-summary', {
        cache: 'no-store',
        signal,
      })
      if (!response.ok)
        throw new Error('Não foi possível atualizar tarefas e cadastros.')
      const result = (await response.json()) as ExtraSummary
      if (signal?.aborted) return
      setExtra(result)
      setExtraError('')
    } catch (cause) {
      if (!signal?.aborted)
        setExtraError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível atualizar tarefas e cadastros.'
        )
    }
  }, [])
  useEffect(() => {
    void initialize()
    const controller = new AbortController()
    const initialLoad = window.setTimeout(() => {
      void loadExtra(controller.signal)
    }, 0)
    const update = () => {
      if (!document.hidden) {
        setNow(Date.now())
        void loadExtra(controller.signal)
      }
    }
    const timer = window.setInterval(update, 30000)
    window.addEventListener('focus', update)
    return () => {
      controller.abort()
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
    }
  }, [initialize, loadExtra])
  async function refreshAll() {
    trackNavigation('cta_click', '/', { action: 'refresh_dashboard' })
    setRefreshing(true)
    try {
      await Promise.all([refresh(), loadExtra()])
      setNow(Date.now())
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      <Header
        fixed
        className='verdant-summary-header bg-background/95 backdrop-blur'
      >
        <div className='min-w-0 flex-1'>
          <Search />
        </div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <ThemeSwitch />
          <div className='hidden sm:block'>
            <ConfigDrawer />
          </div>
          <ProfileDropdown />
        </div>
      </Header>
      <Main className='verdant-summary space-y-4 sm:space-y-5'>
        {!ready && <PageLoading />}
        {ready && !serverConnected && <PageError retry={() => void refreshAll()} />}
        {ready && serverConnected && data.events.length === 0 && <EmptyEvents />}
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold tracking-tight sm:text-2xl'>
              <LocalizedText text='Resumo da operação' />
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              {formatDate(workflow.today, {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              })}{' '}
              · Curitiba
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            className='summary-refresh shrink-0'
            aria-label={translate(
              refreshing ? 'Atualizando…' : 'Atualizar dados'
            )}
            disabled={refreshing}
            onClick={() => {
              void refreshAll()
            }}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span className='hidden sm:inline'>
              <LocalizedText
                text={refreshing ? 'Atualizando…' : 'Atualizar dados'}
              />
            </span>
          </Button>
        </div>
        {summarySwitch}
        <div
          role='status'
          className={`rounded-lg border px-3 py-2 text-sm ${serverConnected ? 'text-muted-foreground' : 'border-amber-500/50 text-amber-700 dark:text-amber-300'}`}
        >
          {!ready
            ? translate('Carregando dados do servidor…')
            : serverConnected
              ? translate('Dados sincronizados com o servidor')
              : translate(
                  'Servidor desconectado. Os dados exibidos podem estar desatualizados.'
                )}
        </div>
        <div className='summary-kpis grid grid-cols-2 gap-3 xl:grid-cols-4' role='region' aria-label='Indicadores da operação'>
          {[
            {
              title: 'Inscrições no período',
              value: fmtCount(workflow.received),
              note: 'Pela data de envio',
              href: recordsHref,
              Icon: UsersRound,
            },
            {
              title: workflow.event
                ? 'Total do evento'
                : 'Inscrições dos eventos ativos',
              value: fmtCount(workflow.registrations.length),
              note: 'Cadastros, sem somar convidados',
              href: recordsHref,
              Icon: ClipboardList,
            },
            {
              title: 'Listas abertas agora',
              value: workflow.event ? fmtCount(workflow.openLists) : '—',
              note: workflow.event
                ? 'Do evento em foco'
                : 'Selecione um evento',
              href: '/verdant/formularios',
              Icon: FileText,
            },
            {
              title: 'Tarefas pendentes',
              value:
                extra && !extraError
                  ? extra.tasks.pending.toLocaleString('pt-BR')
                  : '—',
              note:
                extra && !extraError
                  ? `${extra.tasks.overdue} com prazo vencido`
                  : 'Aguardando atualização',
              href: '/tasks',
              Icon: CheckCircle2,
            },
          ].map(({ title, value, note, href, Icon }) => (
            <a
              href={href}
              key={title}
              className='min-w-0 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:p-4'
            >
              <div className='flex items-start justify-between gap-2 text-muted-foreground'>
                <span className='text-xs font-medium'>
                  <LocalizedText text={title} />
                </span>
                <Icon size={16} className='shrink-0' />
              </div>
              <div className='my-1 min-w-0 font-semibold sm:my-2'>
                <FitValue value={String(value)} maxSize={30} />
              </div>
              <p className='text-xs text-muted-foreground'>
                <LocalizedText text={note} />
              </p>
            </a>
          ))}
        </div>
        <nav
          aria-label={translate('Atalhos da operação')}
          className='summary-shortcuts grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6'
        >
          {[
            { to: '/verdant/agenda', label: 'Agenda' },
            { to: '/verdant/formularios', label: 'Formulários' },
            { to: '/verdant/inscricoes', label: 'Clientes e inscrições' },
            { to: '/verdant/djs', label: 'DJs' },
            { to: '/verdant/influencers', label: 'Influencers' },
            { to: '/verdant/exportacoes', label: 'Relatórios' },
          ].map((item) => (
            <Button asChild className='h-auto min-h-12 justify-between whitespace-normal text-start' key={item.to} size='sm' variant='outline'>
              <a href={item.to}>
                <LocalizedText text={item.label} /><ArrowUpRight size={14} className='shrink-0' aria-hidden='true' />
              </a>
            </Button>
          ))}
        </nav>
        <div className='summary-desktop-columns grid gap-4 xl:grid-cols-[1.4fr_1fr]'>
          <div className='contents xl:block xl:space-y-4'>
<Card className='summary-event-card'>
            <CardHeader className='gap-2'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <CardTitle className='text-base'>
                  {workflow.event?.name || translate('Eventos e listas')}
                </CardTitle>
                <Button asChild size='sm' variant='outline'>
                  <Link to='/verdant/agenda'>
                    <CalendarDays size={14} />
                    <LocalizedText text='Agenda' />
                  </Link>
                </Button>
              </div>
              <CardDescription>
                {workflow.event
                  ? `${formatDate(workflow.event.date, { weekday: 'long', day: '2-digit', month: '2-digit' })} · ${workflow.event.eventTime || translate('Horário a definir')}`
                  : translate('Selecione um evento para acompanhar as listas.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {workflow.event ? (
                <>
                  <div className='summary-event-actions grid gap-2 sm:flex sm:flex-wrap'>
                    <Button asChild size='sm'>
                      <a href={recordsHref}>
                        <UsersRound size={14} />
                        <LocalizedText text='Ver inscrições' />
                      </a>
                    </Button>
                    <Button asChild variant='outline' size='sm'>
                      <a href={reportsHref} target='_blank' rel='noreferrer'>
                        <ClipboardList size={14} />
                        <LocalizedText text='Gerar lista de portaria' />
                      </a>
                    </Button>
                  </div>
                  <div className='divide-y'>
                    {workflow.lists.map((list) => (
                      <div
                        key={list.key}
                        className='flex items-center justify-between gap-2 py-3'
                      >
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <b className='text-sm'>
                              <LocalizedText text={list.title} />
                            </b>
                            <Badge
                              variant='secondary'
                              className={
                                list.status === 'open'
                                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                                  : ''
                              }
                            >
                              <LocalizedText text={listLabels[list.status]} />
                            </Badge>
                          </div>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {list.count} {translate('inscrições')}
                            {list.status === 'open'
                              ? ` · ${translate('Encerra')} ${clock(list.closes)}`
                              : list.status === 'scheduled'
                                ? ` · ${translate('Abre')} ${clock(list.opens)}`
                                : ''}
                          </p>
                        </div>
                        <Button asChild size='sm' variant='ghost'>
                          <a
                            href={
                              list.key === 'LISTA_LOVERS'
                                ? '/lovers'
                                : `/lista/${slug[list.key]}`
                            }
                            target='_blank'
                            rel='noreferrer'
                            aria-label={`${translate('Link público')}: ${translate(list.title)}`}
                          >
                            <ExternalLink size={14} />
                            <span className='hidden sm:inline'>
                              <LocalizedText text='Link público' />
                            </span>
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                  {workflow.issues.length > 0 && (
                    <div className='rounded-lg border border-amber-500/40 p-3'>
                      <p className='mb-2 text-sm font-semibold'>
                        <LocalizedText text='Revisar antes do evento' />
                      </p>
                      <ul className='space-y-2'>
                        {workflow.issues.map((issue) => (
                          <li key={issue.text}>
                            <a
                              className='flex items-center justify-between gap-2 text-xs underline underline-offset-4'
                              href={issue.href}
                            >
                              <LocalizedText text={issue.text} />
                              <ArrowUpRight size={14} />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <section className='space-y-3' aria-label='Próximos eventos'>
                  {workflow.upcoming.length ? workflow.upcoming.slice(0, 4).map(event => <button key={event.id} type='button' className='flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border p-3 text-start hover:bg-muted/40' onClick={() => onFocusEvent(event.id)}><span className='min-w-0'><b className='block text-sm'>{event.name}</b><span className='text-xs text-muted-foreground'>{formatDate(event.date, { weekday: 'short', day: '2-digit', month: '2-digit' })} · {event.eventTime || 'Horário a definir'}</span></span><ArrowUpRight size={18} className='shrink-0' aria-hidden='true' /></button>) : <p className='rounded-lg border border-dashed p-5 text-sm text-muted-foreground'>Não há próximos eventos ativos. Cadastre a próxima programação na agenda.</p>}
                </section>
              )}
            </CardContent>
          </Card>
<Card className='summary-chart-card'>
            <CardHeader>
              <CardTitle className='text-base'>
                <LocalizedText text='Ritmo de inscrições' />
              </CardTitle>
              <CardDescription>
                <LocalizedText text='Envios recebidos no período e no evento selecionado. Horário de Curitiba.' />
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ready && serverConnected ? (
                <>
                  <p className='mb-3 text-sm font-medium'>
                    {workflow.received} {translate('inscrições')}
                  </p>
                  <div className='h-48 min-w-0 sm:h-[230px]'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <BarChart
                        data={workflow.buckets}
                        margin={{ left: -20, right: 8, bottom: 0 }}
                      >
                        <CartesianGrid vertical={false} strokeDasharray='3 3' />
                        <XAxis
                          dataKey='name'
                          fontSize={10}
                          minTickGap={16}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          fontSize={10}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(value) => [
                            value,
                            translate('Inscrições'),
                          ]}
                        />
                        <Bar
                          dataKey='total'
                          fill='var(--primary)'
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {workflow.received === 0 && (
                    <p className='text-xs text-muted-foreground'>
                      <LocalizedText text='Nenhuma inscrição recebida neste período.' />
                    </p>
                  )}
                </>
              ) : (
                <p className='py-12 text-center text-sm text-muted-foreground'>
                  <LocalizedText text='Aguardando dados do servidor.' />
                </p>
              )}
            </CardContent>
          </Card>
          </div>
          <aside className='contents xl:block xl:space-y-4' aria-label='Equipe e atividade recente'>
<Card className='summary-priorities-card'>
              <CardHeader>
                <CardTitle className='text-base'>
                  <LocalizedText text='Prioridades da equipe' />
                </CardTitle>
                <CardDescription>
                  <LocalizedText text='Prazos vencidos primeiro, depois tarefas com data e prioridade.' />
                </CardDescription>
              </CardHeader>
              <CardContent>
                {extraError ? (
                  <p role='alert' className='text-sm text-destructive'>
                    {translate(extraError)}
                  </p>
                ) : !extra ? (
                  <p className='text-sm text-muted-foreground'>
                    <LocalizedText text='Carregando tarefas…' />
                  </p>
                ) : !extra.tasks.items.length ? (
                  <p className='text-sm text-muted-foreground'>
                    <LocalizedText text='Nenhuma tarefa pendente.' />
                  </p>
                ) : (
                  <ul className='space-y-3'>
                    {extra.tasks.items.map((task) => (
                      <li key={task.id}>
                        <a
                          href='/tasks'
                          className='block rounded-md p-2 hover:bg-muted'
                        >
                          <p className='text-sm font-medium'>{task.title}</p>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {task.dueDate
                              ? `${formatDate(task.dueDate, { day: '2-digit', month: '2-digit' })}${task.dueDate < workflow.today ? ` · ${translate('Prazo vencido')}` : ''}`
                              : translate('Sem prazo')}{' '}
                            ·{' '}
                            {translate(
                              {
                                low: 'Baixa',
                                medium: 'Média',
                                high: 'Alta',
                                critical: 'Crítica',
                              }[task.priority] || task.priority
                            )}
                          </p>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <Button asChild className='mt-3' variant='outline' size='sm'>
                  <Link to='/tasks'>
                    <LocalizedText text='Abrir tarefas' />
                  </Link>
                </Button>
              </CardContent>
            </Card>
<Card className='summary-team-card'>
              <CardHeader>
                <CardTitle className='text-base'>
                  <LocalizedText text='Vagas e equipe' />
                </CardTitle>
                <CardDescription>
                  <LocalizedText text='Cadastros recebidos para avaliação da gestão.' />
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
                <a
                  className='flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/40'
                  href='/verdant/cadastros?category=candidates'
                >
                  <span className='text-sm'>
                    <LocalizedText text='Candidaturas de trabalho' />
                  </span>
                  <b>{extra && !extraError ? extra.jobApplications : '—'}</b>
                  <ArrowUpRight size={14} />
                </a>
                {extra && extra.teamRegistrations !== null && (
                  <a
                    className='flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/40'
                    href='/verdant/cadastros?category=team'
                  >
                    <span className='text-sm'>
                      <LocalizedText text='Atualizações cadastrais da equipe' />
                    </span>
                    <b>
                      {extra && !extraError ? extra.teamRegistrations : '—'}
                    </b>
                    <ArrowUpRight size={14} />
                  </a>
                )}
                <div className='summary-public-links grid grid-cols-2 gap-2 pt-2 text-xs sm:flex sm:flex-wrap sm:gap-3'>
                  <a
                    href='/trabalhe-conosco'
                    target='_blank'
                    rel='noreferrer'
                    className='underline'
                  >
                    <LocalizedText text='Formulário de vagas' />
                  </a>
                  <a
                    href='/equipe'
                    target='_blank'
                    rel='noreferrer'
                    className='underline'
                  >
                    <LocalizedText text='Formulário da equipe' />
                  </a>
                </div>
              </CardContent>
            </Card>
<Card className='summary-recent-card'>
            <CardHeader>
              <CardTitle className='text-base'>
                <LocalizedText text='Últimas inscrições' />
              </CardTitle>
              <CardDescription>
                <LocalizedText text='Respostas mais recentes do evento em foco, independentemente do período.' />
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workflow.recent.length ? (
                <ul className='divide-y'>
                  {workflow.recent.map((row) => (
                    <li key={row.id}>
                      <a
                        href={`/verdant/inscricoes?event=${encodeURIComponent(row.eventId)}&form=${row.formKey}`}
                        className='flex items-start justify-between gap-3 py-3'
                      >
                        <div className='min-w-0'>
                          <p className='truncate text-sm font-medium'>
                            {row.name}
                          </p>
                          <p className='truncate text-xs text-muted-foreground'>
                            {row.eventName}
                          </p>
                        </div>
                        <span className='shrink-0 text-xs text-muted-foreground'>
                          {clock(Date.parse(row.createdAt))}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  <LocalizedText
                    text={
                      ready
                        ? 'Nenhuma inscrição para este filtro.'
                        : 'Carregando inscrições…'
                    }
                  />
                </p>
              )}
            </CardContent>
          </Card>
          </aside>
        </div>

      </Main>
    </>
  )
}
