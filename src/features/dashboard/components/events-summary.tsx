import { useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import {
  FORM_DEFS, configFor, formatDate, formTitle, isOpen, visibleRegistrations,
  type VerdantState,
} from '@/features/verdant/data'

const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

type ListStatus = 'open' | 'closed' | 'disabled'

function buildEventSummaries(data: VerdantState, today: string, now = Date.now()) {
  const registrations = visibleRegistrations(data)
  return data.events
    .filter((event) => event.active && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
    .map((event) => {
      const lists = FORM_DEFS.map((def) => {
        const config = configFor(data, def.key, event.id)
        const status: ListStatus = !config?.enabled ? 'disabled' : isOpen(data, def.key, event.id, now) ? 'open' : 'closed'
        const count = registrations.filter((item) => item.eventId === event.id && item.formKey === def.key).length
        return { key: def.key, status, count }
      })
      return { event, lists, total: lists.reduce((sum, list) => sum + list.count, 0) }
    })
}

const statusStyle: Record<ListStatus, string> = {
  open: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  closed: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  disabled: 'bg-muted text-muted-foreground',
}
const statusLabel: Record<ListStatus, string> = { open: 'Aberta', closed: 'Fechada', disabled: 'Não habilitada' }

export function EventsSummary({ data }: { data: VerdantState }) {
  const { translate } = useLanguage()
  const [eventsOpen, setEventsOpen] = useState(false)
  const today = todayKey()
  const summaries = useMemo(() => buildEventSummaries(data, today), [data, today])

  return (
    <div>
      <Dialog open={eventsOpen} onOpenChange={setEventsOpen}>
        <Card>
          <CardContent className='flex flex-wrap items-center gap-3 pt-6'>
            <CalendarDays className='text-muted-foreground' size={20} />
            <div className='min-w-0 flex-1'>
              <div className='font-semibold'><LocalizedText text='Próximos eventos e listas' /></div>
              <p className='text-sm text-muted-foreground'><LocalizedText text='Veja as inscrições e a situação de cada lista por evento.' /></p>
            </div>
            <Badge variant='secondary'>{summaries.length} <LocalizedText text='eventos' /></Badge>
            <DialogTrigger asChild>
              <Button size='sm' disabled={summaries.length === 0}><LocalizedText text='Ver eventos' /></Button>
            </DialogTrigger>
          </CardContent>
        </Card>
        <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-5xl'>
          <DialogHeader>
            <DialogTitle><LocalizedText text='Próximos eventos e listas' /></DialogTitle>
            <DialogDescription><LocalizedText text='Inscrições por lista e se cada lista está aberta agora.' /></DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            {summaries.map(({ event, lists, total }) => (
              <div key={event.id} className='rounded-lg border p-3'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <b className='block truncate text-sm'>{event.name}</b>
                    <span className='text-xs capitalize text-muted-foreground'>{formatDate(event.date, { weekday: 'long', day: '2-digit', month: '2-digit' })}</span>
                  </div>
                  <Badge variant='outline' className='shrink-0'>{total} {translate('inscrições')}</Badge>
                </div>
                <div className='mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3'>
                  {lists.map((list) => (
                    <div key={list.key} className='min-w-0 rounded-md bg-muted/40 px-2 py-1.5'>
                      <div className='truncate text-[11px] text-muted-foreground'>{translate(formTitle(list.key))}</div>
                      <div className='mt-0.5 flex items-center justify-between gap-1'>
                        <span className='text-base font-semibold leading-none'>{list.count}</span>
                        <Badge variant='secondary' className={`h-5 max-w-[72%] truncate px-1.5 text-[10px] ${statusStyle[list.status]}`}>{translate(statusLabel[list.status])}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
