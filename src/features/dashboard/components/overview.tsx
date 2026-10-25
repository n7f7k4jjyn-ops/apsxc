import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCurrentLanguage, useLanguage } from '@/context/language-provider'
import type { Registration, VerdantEvent, FormKey } from '@/features/verdant/data'

type Period = 'day' | 'week' | 'month'
type ChartMode = 'registrations' | 'agenda' | 'lists'
type Bucket = { name: string; total: number } & Partial<Record<FormKey, number>>

const formSeries: { key: FormKey; label: string; color: string }[] = [
  { key: 'DJS', label: 'DJs', color: '#3186a0' },
  { key: 'INFLUENCIADORES', label: 'Influencers', color: '#8067bd' },
  { key: 'LISTA_LOVERS', label: 'Lover', color: '#ca6688' },
  { key: 'VIP', label: 'VIP', color: '#c19746' },
  { key: 'ANIVERSARIO', label: 'Aniversário', color: '#57a27a' },
  { key: 'ENTRADA_GRATUITA', label: 'Entrada gratuita', color: '#6f9f72' },
]

const dateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)

const monthName = (date: Date) =>
  new Intl.DateTimeFormat(getCurrentLanguage(), { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(date)

const shortDate = (date: Date) =>
  new Intl.DateTimeFormat(getCurrentLanguage(), { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '')

// Calendar arithmetic stays on the Curitiba date even when the viewer runs in UTC.
function calendarDate(date: Date) {
  return new Date(`${dateKey(date)}T12:00:00Z`)
}

function moveDate(date: Date, period: Period, amount: number) {
  const next = calendarDate(date)
  if (period === 'day') next.setUTCDate(next.getUTCDate() + amount)
  else if (period === 'week') next.setUTCDate(next.getUTCDate() + amount * 7)
  else next.setUTCMonth(next.getUTCMonth() + amount, 1)
  return next
}

function periodStart(date: Date, period: Period) {
  const start = calendarDate(date)
  if (period === 'week') {
    const offset = (start.getUTCDay() + 6) % 7
    start.setUTCDate(start.getUTCDate() - offset)
  }
  if (period === 'month') start.setUTCDate(1)
  return start
}

function periodLabel(date: Date, period: Period) {
  const start = periodStart(date, period)
  if (period === 'day') return new Intl.DateTimeFormat(getCurrentLanguage(), { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(start)
  if (period === 'month') return monthName(start)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return `${shortDate(start)} – ${shortDate(end)}${start.getUTCMonth() === end.getUTCMonth() ? ` ${start.getUTCFullYear()}` : ` ${end.getUTCFullYear()}`}`
}

function periodBuckets(anchor: Date, period: Period, mode: ChartMode): { name: string; key?: string; hour?: number }[] {
  const start = periodStart(anchor, period)
  if (period === 'day') {
    if (mode === 'agenda') return [{ name: 'Eventos' }]
    return Array.from({ length: 24 }, (_, hour) => ({ name: `${String(hour).padStart(2, '0')}h`, key: dateKey(start), hour }))
  }
  const count = period === 'week' ? 7 : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    const weekday = new Intl.DateTimeFormat(getCurrentLanguage(), { weekday: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '')
    return { name: period === 'week' ? weekday : String(index + 1), key: dateKey(date) }
  })
}

export function buildBuckets(registrations: Registration[], events: VerdantEvent[], anchor: Date, period: Period, mode: ChartMode): Bucket[] {
  const buckets = periodBuckets(anchor, period, mode)
  if (mode === 'agenda') {
    if (period === 'day') {
      const key = dateKey(periodStart(anchor, period))
      return [{ name: 'Eventos', total: events.filter((event) => event.active && event.date === key).length }]
    }
    return buckets.map(({ name, key }) => ({ name, total: events.filter((event) => event.active && event.date === key).length }))
  }

  if (mode === 'lists') {
    const periodKeys = new Set(buckets.map(({ key }) => key).filter((key): key is string => !!key))
    const matches = registrations.filter((registration) => periodKeys.has(dateKey(new Date(registration.createdAt))))
    return formSeries.map(({ key, label }) => {
      const count = matches.filter((registration) => registration.formKey === key).length
      return { name: label, total: count, [key]: count }
    })
  }

  const registrationsAtBucket = (registration: Registration, bucket: (typeof buckets)[number]) => {
    const created = new Date(registration.createdAt)
    if (period === 'day') {
      const hour = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(created))
      return dateKey(created) === bucket.key && hour === bucket.hour
    }
    return dateKey(created) === bucket.key
  }

  return buckets.map((bucket) => {
    const matches = registrations.filter((registration) => registrationsAtBucket(registration, bucket))
    return { name: bucket.name, total: matches.length }
  })
}

export function Overview({ registrations, events = [] }: { registrations: Registration[]; events?: VerdantEvent[] }) {
  const { language, translate } = useLanguage()
  const [period, setPeriod] = useState<Period>('month')
  const [mode, setMode] = useState<ChartMode>('lists')
  const [anchor, setAnchor] = useState(() => new Date())
  const buckets = useMemo(() => buildBuckets(registrations, events, anchor, period, mode), [registrations, events, anchor, period, mode])
  const chartBuckets = useMemo(() => buckets.map((bucket) => ({
    ...bucket,
    name: mode === 'lists' || bucket.name === 'Eventos' ? translate(bucket.name) : bucket.name,
  })), [buckets, mode, translate])
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0)
  const modeLabels: Record<ChartMode, string> = { registrations: 'Inscrições', agenda: 'Agenda', lists: 'Inscrições por lista' }
  const translatedFormSeries = formSeries.map((series) => ({ ...series, label: translate(series.label) }))

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2 px-2'>
        <div className='inline-flex flex-wrap items-center gap-1' aria-label={translate('Tipo de gráfico')}>
          {(['registrations', 'agenda', 'lists'] as const).map((value) => (
            <Button key={value} size='sm' variant={mode === value ? 'secondary' : 'ghost'} aria-pressed={mode === value} onClick={() => setMode(value)}>
              {translate(modeLabels[value])}
            </Button>
          ))}
        </div>
        <div className='flex items-center gap-1'>
          {(['day', 'week', 'month'] as const).map((value) => (
            <Button key={value} size='sm' variant={period === value ? 'secondary' : 'ghost'} aria-pressed={period === value} onClick={() => setPeriod(value)}>
              {translate({ day: 'Dia', week: 'Semana', month: 'Mês' }[value])}
            </Button>
          ))}
        </div>
      </div>
      <div className='flex items-center justify-center gap-1'>
        <Button size='icon' variant='ghost' aria-label={translate('Período anterior')} onClick={() => setAnchor((date) => moveDate(date, period, -1))}><ChevronLeft /></Button>
        <span className='min-w-36 text-center text-sm font-medium capitalize'>{periodLabel(anchor, period)}</span>
        <Button size='icon' variant='ghost' aria-label={translate('Próximo período')} onClick={() => setAnchor((date) => moveDate(date, period, 1))}><ChevronRight /></Button>
      </div>
      <p className='px-2 text-xs text-muted-foreground'>{mode === 'agenda' ? (language === 'en' ? `${total} active events in this period` : `${total} eventos ativos neste período`) : (language === 'en' ? `${total} registrations received in this period` : `${total} inscrições recebidas neste período`)}</p>
      <ResponsiveContainer width='100%' height={Math.max(240, Math.min(900, chartBuckets.length * 30))}>
        <BarChart data={chartBuckets} layout='vertical' margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray='3 3' className='stroke-border' />
          <XAxis type='number' allowDecimals={false} stroke='#888888' fontSize={12} tickLine={false} axisLine={false} />
          <YAxis type='category' dataKey='name' width={104} interval={0} stroke='#888888' fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => [value, translate(mode === 'agenda' ? 'Eventos' : 'Inscrições')]} />
          <Bar dataKey='total' radius={[0, 4, 4, 0]} fill={mode === 'agenda' ? '#58a27a' : '#775ac9'}>
            {mode === 'lists' && translatedFormSeries.map(({ key, color }) => <Cell key={key} fill={color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
