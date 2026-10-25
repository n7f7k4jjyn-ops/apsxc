import { useState, type InputHTMLAttributes } from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export function FilterDateInput({
  label,
  value,
  onValueChange,
  className = '',
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & { label: string; value: string; onValueChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(`${value}T12:00:00`) : undefined
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <input
        {...props}
        type='date'
        aria-label={label}
        className={`w-full min-w-0 ${className}`}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            disabled={props.disabled}
            className='min-h-11 shrink-0 px-3'
            aria-label={`Abrir calendário: ${label}`}
          >
            <CalendarDays size={18} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          role='dialog'
          aria-label={`Calendário: ${label}`}
          className='z-[110] w-auto max-w-[calc(100vw-2rem)] p-0'
          align='start'
        >
          <Calendar
            mode='single'
            captionLayout='dropdown'
            defaultMonth={selected}
            selected={selected}
            onSelect={(date) => {
              if (!date) return
              onValueChange(
                `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
              )
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </span>
  )
}
