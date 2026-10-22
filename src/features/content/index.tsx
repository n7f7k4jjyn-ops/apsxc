import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ExternalLink,
  LayoutGrid,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'

type ViewMode = 'month' | 'week' | 'kanban'
type ContentFormat = 'feed' | 'reels' | 'stories' | 'highlight'
type ContentStatus = 'waiting' | 'progress' | 'scheduled' | 'completed'

type ContentItem = {
  id: string
  title: string
  scheduledAt: string
  format: ContentFormat
  status: ContentStatus
  event?: string
  materialUrl?: string
  caption?: string
  instagramCaption?: string
  facebookCaption?: string
  storyReminder?: string
  eventPageUrl?: string
  djHandles?: string
  notes?: string
  responsible?: string
  facebookEventPublished?: boolean
  facebookEventUrl?: string
  createdAt?: string
  updatedAt?: string
}

const statuses: { key: ContentStatus; label: string }[] = [
  { key: 'waiting', label: 'Aguardando agendamento' },
  { key: 'progress', label: 'Em andamento' },
  { key: 'scheduled', label: 'Agendado' },
  { key: 'completed', label: 'Concluído' },
]

const formatLabels: Record<ContentFormat, string> = {
  feed: 'FEED',
  reels: 'REELS',
  stories: 'STORIES',
  highlight: 'DESTAQUE',
}

const eventTone: Record<string, string> = {
  'MODO F*NK': 'border-cyan-400/60',
  'FRENÉTIKA': 'border-rose-400/60',
  'GOSTOSO': 'border-yellow-400/60',
  'RESSAKA': 'border-amber-400/60',
  'HALLOWEEN': 'border-violet-400/60',
  'AGENDA': 'border-fuchsia-400/60',
}


function isoTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

function dayKey(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

function monthTitle(date: Date) {
  const value = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(date)
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function eventKey(item: ContentItem) {
  const raw = (item.event || item.title).toUpperCase()
  return Object.keys(eventTone).find((key) => raw.includes(key)) || ''
}

function formatDateInput(iso: string) {
  return dayKey(iso)
}

function formatTimeInput(iso: string) {
  return isoTime(iso)
}

function makeIso(date: string, time: string) {
  return `${date}T${time || '12:00'}:00-03:00`
}


function normalizeStatus(status: string): ContentStatus {
  if (status === 'published' || status === 'completed') return 'completed'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'progress') return 'progress'
  return 'waiting'
}

function effectiveStatus(item: ContentItem): ContentStatus {
  if (item.status === 'scheduled' && Date.parse(item.scheduledAt) <= Date.now()) return 'completed'
  return item.status
}

function CardItem({ item, onOpen, draggable = false, onDragStart }: { item: ContentItem; onOpen: (item: ContentItem) => void; draggable?: boolean; onDragStart?: (event: DragEvent<HTMLButtonElement>, item: ContentItem) => void }) {
  const tone = eventTone[eventKey(item)] || 'border-border'
  return (
    <button
      type='button'
      draggable={draggable}
      onDragStart={(event) => onDragStart?.(event, item)}
      onClick={() => onOpen(item)}
      className={`w-full rounded-xl border border-l-4 ${tone} bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className='flex items-center justify-between gap-2'>
        <span className='text-sm font-semibold'>{isoTime(item.scheduledAt)}</span>
        <span className='rounded-md bg-muted px-2 py-1 text-[10px] font-bold tracking-wide text-muted-foreground'>{formatLabels[item.format]}</span>
      </div>
      <p className='mt-2 text-sm font-medium leading-snug'>{item.title}</p>
      {item.event && <p className='mt-1 text-xs text-muted-foreground'>{item.event}</p>}
    </button>
  )
}

function CalendarItem({ item, onOpen }: { item: ContentItem; onOpen: (item: ContentItem) => void }) {
  const tone = eventTone[eventKey(item)] || 'border-border'
  return (
    <button
      type='button'
      onClick={() => onOpen(item)}
      className='flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition hover:bg-muted'
      title={item.title}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${tone}`} aria-hidden='true' />
      <span>{isoTime(item.scheduledAt)}</span>
    </button>
  )
}

export function ContentPlanner() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(new Date('2026-10-19T12:00:00-03:00'))
  const [editing, setEditing] = useState<ContentItem | null>(null)
  const [creating, setCreating] = useState(false)

  async function refresh(showLoading = true) {
    if (showLoading) setLoading(true)
    try {
      const response = await fetch('/api/content-plan', { credentials: 'same-origin', cache: 'no-store' })
      const data = await response.json() as { items?: ContentItem[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o calendário.')
      setItems((data.items || []).map((item) => ({
        ...item,
        status: normalizeStatus(String(item.status)),
        facebookEventPublished: item.facebookEventPublished ?? true,
      })).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar o calendário.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void Promise.resolve().then(() => refresh(false)) }, [])

  const monthCells = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const first = new Date(year, month, 1)
    const start = new Date(year, month, 1 - first.getDay())
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      const key = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
      return { date, key, current: date.getMonth() === month, items: items.filter((item) => dayKey(item.scheduledAt) === key) }
    })
  }, [cursor, items])

  const weekCells = useMemo(() => {
    const date = new Date(cursor)
    const start = new Date(date)
    start.setDate(date.getDate() - date.getDay())
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start)
      day.setDate(start.getDate() + index)
      const key = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(day)
      return { date: day, key, items: items.filter((item) => dayKey(item.scheduledAt) === key) }
    })
  }, [cursor, items])

  async function updateStatus(item: ContentItem, status: ContentStatus) {
    if (item.status === status) return
    try {
      const response = await fetch(`/api/content-plan/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, status }),
      })
      const updated = await response.json() as ContentItem & { error?: string }
      if (!response.ok) throw new Error(updated.error || 'Não foi possível atualizar o status.')
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...updated, status: normalizeStatus(String(updated.status)) } : entry).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar.')
    }
  }

  function moveCursor(delta: number) {
    const next = new Date(cursor)
    if (view === 'month') next.setMonth(next.getMonth() + delta)
    else next.setDate(next.getDate() + 7 * delta)
    setCursor(next)
  }

  const eventSummaries = useMemo(() => {
    const groups = new Map<string, ContentItem[]>()
    for (const item of items) {
      const name = (item.event || '').trim()
      if (!name || name.toUpperCase() === 'AGENDA') continue
      groups.set(name, [...(groups.get(name) || []), item])
    }
    return [...groups.entries()].map(([name, entries]) => {
      const completed = entries.filter((item) => effectiveStatus(item) === 'completed').length
      const scheduled = entries.filter((item) => effectiveStatus(item) === 'scheduled').length
      const progress = entries.length ? Math.round(((completed + scheduled * 0.75) / entries.length) * 100) : 0
      return {
        name,
        total: entries.length,
        completed,
        scheduled,
        waiting: entries.filter((item) => effectiveStatus(item) === 'waiting').length,
        facebook: entries.every((item) => item.facebookEventPublished !== false),
        progress,
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [items])

  const totalCompleted = items.filter((item) => effectiveStatus(item) === 'completed').length
  const totalScheduled = items.filter((item) => effectiveStatus(item) === 'scheduled').length
  const totalWaiting = items.filter((item) => effectiveStatus(item) === 'waiting').length
  const overallProgress = items.length ? Math.round(((totalCompleted + totalScheduled * 0.75) / items.length) * 100) : 0

  return (
    <>
      <Header fixed>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-3'>
            <img src='/images/verdant-heart.webp' alt='Verdant' className='h-8 w-8 object-contain' />
            <span className='hidden text-sm font-medium text-muted-foreground sm:inline'>Conteúdo</span>
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-0.5'><ThemeSwitch /><ProfileDropdown /></div>
      </Header>
      <Main className='space-y-5'>
        <section className='overflow-hidden rounded-2xl border bg-card'>
          <div className='flex flex-col gap-5 bg-gradient-to-r from-fuchsia-500/10 via-background to-violet-500/10 p-5 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-center gap-4'>
              <img src='/images/verdant-logo-colorida.webp' alt='Verdant' className='h-14 w-auto max-w-36 object-contain' />
              <div className='h-9 w-px bg-border' />
              <img src='/images/scope-connect-colorida.webp' alt='Connect Scope' className='h-8 w-auto max-w-32 object-contain' />
            </div>
            <div>
              <h1 className='text-2xl font-semibold tracking-tight'>Planejamento de Conteúdo</h1>
              <p className='mt-1 text-sm text-muted-foreground'>Calendário, semana e fluxo de aprovação da equipe em uma única tela.</p>
            </div>
          </div>
        </section>

        <section className='flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <Button type='button' variant='outline' size='icon' onClick={() => moveCursor(-1)} aria-label='Anterior'><ChevronLeft size={16} /></Button>
            <Button type='button' variant='outline' onClick={() => setCursor(new Date('2026-10-19T12:00:00-03:00'))}>Hoje</Button>
            <Button type='button' variant='outline' size='icon' onClick={() => moveCursor(1)} aria-label='Próximo'><ChevronRight size={16} /></Button>
            <span className='ml-1 min-w-44 text-sm font-semibold'>{view === 'month' ? monthTitle(cursor) : 'Semana de ' + new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(weekCells[0]?.date)}</span>
          </div>
          <div className='flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto'>
            <div className='grid w-full grid-cols-3 rounded-lg border p-1 sm:flex sm:w-auto'>
              <button type='button' onClick={() => setView('month')} className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${view === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><CalendarDays size={14} />Mês</button>
              <button type='button' onClick={() => setView('week')} className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${view === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutGrid size={14} />Semana</button>
              <button type='button' onClick={() => setView('kanban')} className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Columns3 size={14} />Kanban</button>
            </div>
            <Button type='button' className='w-full sm:w-auto' onClick={() => setCreating(true)}><Plus size={16} />Nova publicação</Button>
          </div>
        </section>

        {!loading && view === 'kanban' && (
          <>
            <section className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              <div className='rounded-2xl border bg-card p-4'><p className='text-xs text-muted-foreground'>Eventos</p><b className='mt-1 block text-2xl'>{eventSummaries.length}</b></div>
              <div className='rounded-2xl border bg-card p-4'><p className='text-xs text-muted-foreground'>Progresso geral</p><b className='mt-1 block text-2xl'>{overallProgress}%</b><div className='mt-2 h-1.5 overflow-hidden rounded-full bg-muted'><div className='h-full bg-primary' style={{ width: `${overallProgress}%` }} /></div></div>
              <div className='rounded-2xl border bg-card p-4'><p className='text-xs text-muted-foreground'>Aguardando agendamento</p><b className='mt-1 block text-2xl'>{totalWaiting}</b></div>
              <div className='rounded-2xl border bg-card p-4'><p className='text-xs text-muted-foreground'>Eventos Facebook</p><b className='mt-1 block text-2xl'>{eventSummaries.filter((event) => event.facebook).length}/{eventSummaries.length}</b><p className='mt-1 text-xs text-muted-foreground'>publicados</p></div>
            </section>
            <section className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
              {eventSummaries.map((event) => (
                <div key={event.name} className='rounded-2xl border bg-card p-4'>
                  <div className='flex items-start justify-between gap-3'>
                    <div><b className='text-sm'>{event.name}</b><p className='mt-1 text-xs text-muted-foreground'>{event.total} publicações</p></div>
                    <span className='text-sm font-semibold'>{event.progress}%</span>
                  </div>
                  <div className='mt-3 h-1.5 overflow-hidden rounded-full bg-muted'><div className='h-full bg-primary' style={{ width: `${event.progress}%` }} /></div>
                  <div className='mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground'>
                    <span>{event.waiting} aguardando</span><span>·</span><span>{event.scheduled} agendadas</span><span>·</span><span>{event.completed} concluídas</span>
                  </div>
                  <div className='mt-2 text-xs'>{event.facebook ? '✓ Evento do Facebook publicado' : '○ Evento do Facebook pendente'}</div>
                </div>
              ))}
            </section>
          </>
        )}

        {loading ? <div className='rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground'>Carregando planejamento…</div> : view === 'month' ? (
          <section className='overflow-hidden rounded-2xl border bg-card md:overflow-x-auto'>
            <div className='grid grid-cols-7 md:min-w-[980px] border-b bg-muted/30 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
              {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((day) => <div key={day} className='p-3'>{day}</div>)}
            </div>
            <div className='grid grid-cols-7 md:min-w-[980px]'>
              {monthCells.map((cell) => (
                <div key={cell.key} className={`min-h-20 border-b border-r p-1 sm:min-h-28 sm:p-2 md:min-h-36 ${cell.current ? 'bg-background' : 'bg-muted/20 text-muted-foreground'}`}>
                  <div className='mb-2 text-xs font-semibold'>{cell.date.getDate()}</div>
                  <div className='space-y-2'>
                    {cell.items.slice(0, 4).map((item) => <CalendarItem key={item.id} item={item} onOpen={setEditing} />)}
                    {cell.items.length > 4 && <button type='button' className='text-xs font-medium text-primary' onClick={() => setView('week')}>+{cell.items.length - 4} publicações</button>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : view === 'week' ? (
          <section className='grid gap-3 xl:grid-cols-7'>
            {weekCells.map((cell) => (
              <div key={cell.key} className='min-h-64 rounded-2xl border bg-card p-3'>
                <div className='mb-3 border-b pb-3'>
                  <p className='text-xs font-medium uppercase text-muted-foreground'>{new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(cell.date)}</p>
                  <p className='text-lg font-semibold'>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(cell.date)}</p>
                </div>
                <div className='space-y-1'>{cell.items.map((item) => <CalendarItem key={item.id} item={item} onOpen={setEditing} />)}</div>
              </div>
            ))}
          </section>
        ) : (
          <section className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            {statuses.map((column) => {
              const columnItems = items.filter((item) => effectiveStatus(item) === column.key)
              return (
                <div
                  key={column.key}
                  className='min-h-0 rounded-2xl border bg-muted/20 p-3 sm:min-h-[360px] xl:min-h-[520px]'
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const id = event.dataTransfer.getData('text/plain')
                    const item = items.find((entry) => entry.id === id)
                    if (item) void updateStatus(item, column.key)
                  }}
                >
                  <div className='mb-3 flex items-center justify-between'>
                    <h2 className='text-sm font-semibold'>{column.label}</h2>
                    <span className='rounded-full bg-background px-2 py-1 text-xs text-muted-foreground'>{columnItems.length}</span>
                  </div>
                  <div className='space-y-2'>
                    {columnItems.map((item) => <CardItem key={item.id} item={item} draggable onDragStart={(event, entry) => event.dataTransfer.setData('text/plain', entry.id)} onOpen={setEditing} />)}
                  </div>
                </div>
              )
            })}
          </section>
        )}
      </Main>
      {(editing || creating) && <Editor item={editing} onClose={() => { setEditing(null); setCreating(false) }} onSaved={(saved) => { setItems((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))); setEditing(null); setCreating(false) }} onDeleted={(id) => { setItems((current) => current.filter((item) => item.id !== id)); setEditing(null) }} />}
    </>
  )
}

function Editor({ item, onClose, onSaved, onDeleted }: { item: ContentItem | null; onClose: () => void; onSaved: (item: ContentItem) => void; onDeleted: (id: string) => void }) {
  const [title, setTitle] = useState(item?.title || '')
  const [date, setDate] = useState(item ? formatDateInput(item.scheduledAt) : '2026-10-19')
  const [time, setTime] = useState(item ? formatTimeInput(item.scheduledAt) : '18:00')
  const [format, setFormat] = useState<ContentFormat>(item?.format || 'stories')
  const [status, setStatus] = useState<ContentStatus>(item ? effectiveStatus(item) : 'waiting')
  const [event, setEvent] = useState(item?.event || '')
  const [materialUrl, setMaterialUrl] = useState(item?.materialUrl || '')
  const [responsible, setResponsible] = useState(item?.responsible || '')
  const [instagramCaption, setInstagramCaption] = useState(item?.instagramCaption || item?.caption || '')
  const [facebookCaption, setFacebookCaption] = useState(item?.facebookCaption || '')
  const [storyReminder, setStoryReminder] = useState(item?.storyReminder || '')
  const [eventPageUrl, setEventPageUrl] = useState(item?.eventPageUrl || '')
  const [djHandles, setDjHandles] = useState(item?.djHandles || '')
  const [notes, setNotes] = useState(item?.notes || '')
  const [facebookEventPublished, setFacebookEventPublished] = useState(item?.facebookEventPublished ?? true)
  const [facebookEventUrl, setFacebookEventUrl] = useState(item?.facebookEventUrl || '')
  const [saving, setSaving] = useState(false)

  async function submit(eventSubmit: FormEvent) {
    eventSubmit.preventDefault()
    setSaving(true)
    try {
      const payload = { title, scheduledAt: makeIso(date, time), format, status, event, materialUrl, responsible, caption: instagramCaption, instagramCaption, facebookCaption, storyReminder, eventPageUrl, djHandles, notes, facebookEventPublished, facebookEventUrl }
      const response = await fetch(item ? `/api/content-plan/${encodeURIComponent(item.id)}` : '/api/content-plan', {
        method: item ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json() as ContentItem & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.')
      onSaved(result)
      toast.success('Publicação salva.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!item || !window.confirm('Excluir esta publicação do planejamento?')) return
    const response = await fetch(`/api/content-plan/${encodeURIComponent(item.id)}`, { method: 'DELETE', credentials: 'same-origin' })
    const result = await response.json() as { error?: string }
    if (!response.ok) return toast.error(result.error || 'Não foi possível excluir.')
    onDeleted(item.id)
    toast.success('Publicação removida.')
  }

  const field = 'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring'

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4' onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form onSubmit={submit} className='max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl'>
        <div className='mb-5 flex items-start justify-between gap-3'>
          <div><h2 className='text-xl font-semibold'>{item ? 'Editar publicação' : 'Nova publicação'}</h2><p className='mt-1 text-sm text-muted-foreground'>O mesmo item aparece no calendário, semana e Kanban.</p></div>
          <Button type='button' size='icon' variant='ghost' onClick={onClose}><X size={17} /></Button>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <label className='sm:col-span-2'><span className='mb-1 block text-xs font-medium'>Título</span><input required value={title} onChange={(event) => setTitle(event.target.value)} className={field} /></label>
          <label><span className='mb-1 block text-xs font-medium'>Data</span><input required type='date' value={date} onChange={(event) => setDate(event.target.value)} className={field} /></label>
          <label><span className='mb-1 block text-xs font-medium'>Horário</span><input required type='time' value={time} onChange={(event) => setTime(event.target.value)} className={field} /></label>
          <label><span className='mb-1 block text-xs font-medium'>Formato</span><select value={format} onChange={(event) => setFormat(event.target.value as ContentFormat)} className={field}><option value='feed'>Feed</option><option value='reels'>Reels</option><option value='stories'>Stories</option><option value='highlight'>Destaque</option></select></label>
          <label><span className='mb-1 block text-xs font-medium'>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as ContentStatus)} className={field}>{statuses.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
          <label><span className='mb-1 block text-xs font-medium'>Evento</span><input value={event} onChange={(e) => setEvent(e.target.value)} className={field} placeholder='Ex.: GOSTOSO' /></label>
          <label><span className='mb-1 block text-xs font-medium'>Responsável</span><input value={responsible} onChange={(e) => setResponsible(e.target.value)} className={field} placeholder='Equipe / pessoa' /></label>
          <label className='sm:col-span-2 flex items-center gap-3 rounded-lg border p-3'>
            <input type='checkbox' checked={facebookEventPublished} onChange={(e) => setFacebookEventPublished(e.target.checked)} />
            <span><b className='text-sm'>Evento do Facebook publicado</b><span className='block text-xs text-muted-foreground'>Marque quando o evento oficial já estiver criado/publicado.</span></span>
          </label>
          <label className='sm:col-span-2'><span className='mb-1 block text-xs font-medium'>Link do evento no Facebook</span><input value={facebookEventUrl} onChange={(e) => setFacebookEventUrl(e.target.value)} className={field} placeholder='https://facebook.com/events/...' /></label>
          <label className='sm:col-span-2'><span className='mb-1 block text-xs font-medium'>Link do material</span><div className='flex gap-2'><input value={materialUrl} onChange={(e) => setMaterialUrl(e.target.value)} className={field} placeholder='Google Drive' />{materialUrl && <a href={materialUrl} target='_blank' rel='noreferrer' className='inline-flex items-center justify-center rounded-lg border px-3' title='Abrir material'><ExternalLink size={16} /></a>}</div></label>
          <div className='sm:col-span-2 grid gap-3 rounded-xl border bg-muted/20 p-4'>
            <div><b className='text-sm'>Briefing da publicação</b><p className='text-xs text-muted-foreground'>Informações prontas para copiar, agendar e publicar.</p></div>
            <label><span className='mb-1 block text-xs font-medium'>Legenda Instagram</span><textarea value={instagramCaption} onChange={(e) => setInstagramCaption(e.target.value)} rows={6} className={field} /></label>
            <label><span className='mb-1 block text-xs font-medium'>Legenda Facebook</span><textarea value={facebookCaption} onChange={(e) => setFacebookCaption(e.target.value)} rows={6} className={field} /></label>
            <label><span className='mb-1 block text-xs font-medium'>DJs / @</span><textarea value={djHandles} onChange={(e) => setDjHandles(e.target.value)} rows={3} className={field} placeholder='@dj1 · @dj2 · @dj3' /></label>
            <label><span className='mb-1 block text-xs font-medium'>Link Saiba mais</span><input value={eventPageUrl} onChange={(e) => setEventPageUrl(e.target.value)} className={field} placeholder='https://www.verdantcwb.com/evento' /></label>
            <label><span className='mb-1 block text-xs font-medium'>Lembrete para Stories</span><textarea value={storyReminder} onChange={(e) => setStoryReminder(e.target.value)} rows={3} className={field} /></label>
          </div>
          <label className='sm:col-span-2'><span className='mb-1 block text-xs font-medium'>Observações internas</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={field} /></label>
        </div>
        <div className='mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4'>
          <div>{item && <Button type='button' variant='destructive' onClick={() => void remove()}><Trash2 size={15} />Excluir</Button>}</div>
          <div className='flex gap-2'><Button type='button' variant='outline' onClick={onClose}>Cancelar</Button><Button type='submit' disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button></div>
        </div>
      </form>
    </div>
  )
}
