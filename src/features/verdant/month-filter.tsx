import { LocalizedText } from '@/context/language-provider'

export function MonthFilter({ value, onChange, label = 'Mês', clearable = true }: { value: string; onChange: (month: string) => void; label?: string; clearable?: boolean }) {
  return <label className='verdant-field verdant-month-filter min-w-0'><LocalizedText text={label} /><span className='flex min-w-0 items-center gap-2'><input className='min-h-11 min-w-0 w-full rounded-md border bg-background px-3 text-sm' type='month' aria-label={label} value={value} onChange={event => onChange(event.target.value)} />{value && clearable && <button className='min-h-11 shrink-0 rounded-md border px-3 text-sm' type='button' aria-label={`Limpar ${label.toLocaleLowerCase('pt-BR')}`} onClick={() => onChange('')}><LocalizedText text='Limpar' /></button>}</span></label>
}
