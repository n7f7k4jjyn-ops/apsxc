import {
  FORM_DEFS,
  visibleRegistrations,
  localDateTime,
  type VerdantState,
} from '@/features/verdant/data'

export type Period = 'day' | 'week' | 'month'
export type DateRange = { from: string; to: string }
type ListStatus = 'open' | 'closed' | 'scheduled' | 'disabled' | 'invalid'
export const timeZone = 'America/Sao_Paulo'
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone,
  hour: '2-digit',
  hourCycle: 'h23',
})
export const dateKey = (value: number | Date) => dateFormatter.format(value)
const shift = (key: string, amount: number) => {
  const value = new Date(`${key}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}
export function periodKeys(now: number, period: Period, range?: DateRange) {
  if (range) {
    const valid = (value: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    if (!valid(range.from) || !valid(range.to) || range.from > range.to)
      throw new Error(
        'Informe data inicial e final válidas, em ordem cronológica.'
      )
    const days =
      Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1
    if (days > 3660) throw new Error('Selecione um intervalo de até 10 anos.')
    return Array.from({ length: days }, (_, i) => shift(range.from, i))
  }
  const today = dateKey(now)
  if (period === 'day') return [today]
  const value = new Date(`${today}T12:00:00Z`)
  const start =
    period === 'week'
      ? shift(today, -((value.getUTCDay() + 6) % 7))
      : `${today.slice(0, 7)}-01`
  const count =
    period === 'week'
      ? 7
      : new Date(
          Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)
        ).getUTCDate()
  return Array.from({ length: count }, (_, i) => shift(start, i))
}
export function buildWorkflow(
  data: VerdantState,
  now: number,
  period: Period,
  focusId: string,
  range?: DateRange
) {
  const today = dateKey(now)
  const events = data.events
    .filter((event) => event.active)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
    )
  const upcoming = events.filter((event) => event.date >= today)
  const event =
    focusId === 'all'
      ? undefined
      : (data.events.find((item) => item.id === focusId) ?? upcoming[0])
  const visible = visibleRegistrations(data)
  const registrations = event
    ? (event.active ? visible : data.registrations).filter(
        (row) => row.eventId === event.id
      )
    : visible
  const keys = periodKeys(now, period, range)
  const keySet = new Set(keys)
  const buckets =
    period === 'day' && !range
      ? Array.from({ length: 24 }, (_, hour) => ({
          name: `${String(hour).padStart(2, '0')}h`,
          total: 0,
        }))
      : keys.map((key) => ({
          name: `${key.slice(8)}/${key.slice(5, 7)}`,
          total: 0,
        }))
  let received = 0
  for (const row of registrations) {
    const stamp = Date.parse(row.createdAt)
    if (!Number.isFinite(stamp)) continue
    const key = dateKey(stamp)
    if (!keySet.has(key)) continue
    received++
    const index =
      period === 'day' && !range
        ? Number(hourFormatter.format(stamp))
        : keys.indexOf(key)
    buckets[index].total++
  }
  const configs = new Map(
    data.forms
      .filter((form) => form.eventId === event?.id)
      .map((form) => [form.key, form])
  )
  const counts = new Map<string, number>()
  for (const row of registrations)
    counts.set(row.formKey, (counts.get(row.formKey) ?? 0) + 1)
  const lists = event
    ? FORM_DEFS.map((definition) => {
        const config = configs.get(definition.key)
        const opens = localDateTime(config?.openAt ?? '')
        const closes = localDateTime(
          `${event.date}T${config?.cutoff || (definition.key === 'ANIVERSARIO' ? '15:00' : '19:00')}`
        )
        const status: ListStatus = !config?.enabled
          ? 'disabled'
          : !Number.isFinite(opens) ||
              !Number.isFinite(closes) ||
              opens >= closes
            ? 'invalid'
            : now < opens
              ? 'scheduled'
              : now >= closes
                ? 'closed'
                : 'open'
        return {
          ...definition,
          config,
          count: counts.get(definition.key) ?? 0,
          status,
          opens,
          closes,
        }
      })
    : []
  const issues: { text: string; href: string }[] = []
  if (event && event.date >= today) {
    if (!event.eventTime)
      issues.push({
        text: 'Defina o horário de início do evento.',
        href: '/verdant/agenda',
      })
    if (!lists.some((list) => list.config?.enabled))
      issues.push({
        text: 'Nenhuma lista habilitada para este evento.',
        href: '/verdant/formularios',
      })
    for (const list of lists) {
      if (list.status === 'invalid')
        issues.push({
          text: `Revise os horários de ${list.title}.`,
          href: '/verdant/formularios',
        })
      const kind =
        list.key === 'DJS'
          ? 'DJ'
          : list.key === 'INFLUENCIADORES'
            ? 'INFLUENCIADORES'
            : null
      if (
        kind &&
        list.config?.enabled &&
        !data.people.some(
          (person) =>
            person.active &&
            person.kind === kind &&
            person.eventIds.includes(event.id)
        )
      )
        issues.push({
          text: `Vincule profissionais à lista ${list.title}.`,
          href: kind === 'DJ' ? '/verdant/djs' : '/verdant/influencers',
        })
    }
  }
  return {
    today,
    events,
    upcoming,
    event,
    registrations,
    received,
    buckets,
    lists,
    issues,
    openLists: lists.filter((list) => list.status === 'open').length,
    recent: registrations
      .filter((row) => Number.isFinite(Date.parse(row.createdAt)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
  }
}
