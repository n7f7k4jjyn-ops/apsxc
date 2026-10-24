import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Roster } from './roster-types'

const key = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function RosterCalendar({
  rows,
  selected,
  onSelect,
}: {
  rows: Roster[]
  selected: string
  onSelect: (date: string) => void
}) {
  const [anchor, setAnchor] = useState(() => new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const start = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    view === 'month' ? 1 : anchor.getDate()
  )
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const days = Array.from({ length: view === 'month' ? 42 : 7 }, (_, i) => {
    const day = new Date(start)
    day.setDate(day.getDate() + i)
    return day
  })
  function move(delta: number) {
    const next = new Date(anchor)
    if (view === 'month') {
      next.setDate(1)
      next.setMonth(next.getMonth() + delta)
    } else next.setDate(next.getDate() + delta * 7)
    setAnchor(next)
    onSelect('')
  }
  return (
    <section className='roster-calendar' aria-label='Calendário de escalas'>
      <div className='roster-toolbar'>
        <Button
          variant='outline'
          aria-label='Período anterior'
          onClick={() => move(-1)}
        >
          ←
        </Button>
        <b>
          {new Intl.DateTimeFormat('pt-BR', {
            month: 'long',
            year: 'numeric',
          }).format(anchor)}
        </b>
        <Button
          variant='outline'
          aria-label='Próximo período'
          onClick={() => move(1)}
        >
          →
        </Button>
        <Button
          variant='outline'
          onClick={() => {
            setAnchor(new Date())
            onSelect('')
          }}
        >
          Hoje
        </Button>
        <Button
          variant={view === 'month' ? 'default' : 'outline'}
          onClick={() => setView('month')}
        >
          Mês
        </Button>
        <Button
          variant={view === 'week' ? 'default' : 'outline'}
          onClick={() => setView('week')}
        >
          Semana
        </Button>
        {selected && (
          <Button variant='ghost' onClick={() => onSelect('')}>
            Limpar dia
          </Button>
        )}
      </div>
      <div className='roster-calendar-grid'>
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
          <b key={day}>{day}</b>
        ))}
        {days.map((day) => {
          const date = key(day),
            items = rows.filter((row) => row.date === date)
          return (
            <button
              key={date}
              type='button'
              aria-label={`${date}: ${items.length} escalas`}
              aria-pressed={selected === date}
              className={day.getMonth() !== anchor.getMonth() ? 'outside' : ''}
              onClick={() => onSelect(selected === date ? '' : date)}
            >
              <span>{day.getDate()}</span>
              {items.map((row) => (
                <small key={row.id}>
                  {row.eventName} ·{' '}
                  {row.kind === 'staff' ? 'STAFF' : 'Segurança'} ·{' '}
                  {row.entries.length} pessoas
                </small>
              ))}
            </button>
          )
        })}
      </div>
    </section>
  )
}
