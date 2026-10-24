import { useState, type ReactNode } from 'react'
import { ListFilter } from 'lucide-react'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import type { SortDirection } from './data'

type ColumnFilterOption = { value: string; label: string }

export function ColumnFilterControl({
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
  return (
    <div className='verdant-column-filter'>
      <button
        type='button'
        className={`verdant-column-filter-trigger ${value ? 'active' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ListFilter size={14} />
        <LocalizedText text={label} />
        {value && <span className='verdant-filter-dot' />}
      </button>
      {open && (
        <div className='verdant-column-filter-input'>
          {options ? (
            <select
              aria-label={`${translate('Filtrar')}: ${translate(label)}`}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {translate(option.label)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type='search'
              aria-label={`${translate('Filtrar')}: ${translate(label)}`}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={translate(
                placeholder || `Filtrar ${label.toLowerCase()}`
              )}
            />
          )}
          {value && (
            <button
              type='button'
              className='verdant-column-filter-clear'
              onClick={() => onChange('')}
            >
              {<LocalizedText text='Limpar' />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function SortButton({
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
  return (
    <button type='button' className='verdant-sort-header' onClick={onClick}>
      <span>{label}</span>
      <span className='verdant-sort-indicator' aria-hidden='true'>
        {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  )
}

export function SortableTableHeader({
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
  return (
    <th
      aria-sort={
        active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <SortButton
        label={label}
        active={active}
        direction={direction}
        onClick={onClick}
      />
    </th>
  )
}
