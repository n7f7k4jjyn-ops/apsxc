import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { LocalizedText } from '@/context/language-provider'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export function MonthFilter({
  value,
  onChange,
  label = 'Mês',
  clearable = true,
}: {
  value: string
  onChange: (month: string) => void
  label?: string
  clearable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  return (
    <label className='verdant-field verdant-month-filter min-w-0'>
      <LocalizedText text={label} />
      <span className='flex min-w-0 items-center gap-2'>
        <input
          className='min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm'
          type='month'
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next)
              setYear(
                value ? Number(value.slice(0, 4)) : new Date().getFullYear()
              )
            setOpen(next)
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type='button'
              className='min-h-11 shrink-0 px-3'
              aria-label={`Abrir calendário de ${label.toLocaleLowerCase('pt-BR')}`}
            >
              <CalendarDays size={18} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            role='dialog'
            aria-label={`Calendário de ${label.toLocaleLowerCase('pt-BR')}`}
            className='z-[110] w-72 max-w-[calc(100vw-2rem)] p-3'
            align='start'
          >
            <div className='mb-3 flex items-center justify-between'>
              <Button
                type='button'
                variant='ghost'
                aria-label='Ano anterior'
                onClick={() => setYear((current) => current - 1)}
              >
                <ChevronLeft />
              </Button>
              <b aria-live='polite'>{year}</b>
              <Button
                type='button'
                variant='ghost'
                aria-label='Próximo ano'
                onClick={() => setYear((current) => current + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <div className='grid grid-cols-3 gap-2'>
              {Array.from({ length: 12 }, (_, index) => {
                const key = `${year}-${String(index + 1).padStart(2, '0')}`
                const name = new Date(year, index, 15)
                  .toLocaleString('pt-BR', { month: 'short' })
                  .replace('.', '')
                return (
                  <Button
                    type='button'
                    key={key}
                    variant={value === key ? 'default' : 'outline'}
                    aria-label={`${name} de ${year}`}
                    aria-pressed={value === key}
                    onClick={() => {
                      onChange(key)
                      setOpen(false)
                    }}
                  >
                    {name}
                  </Button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
        {value && clearable && (
          <button
            className='min-h-11 shrink-0 rounded-md border px-3 text-sm'
            type='button'
            aria-label={`Limpar ${label.toLocaleLowerCase('pt-BR')}`}
            onClick={() => onChange('')}
          >
            <LocalizedText text='Limpar' />
          </button>
        )}
      </span>
    </label>
  )
}
