import { useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { FORM_DEFS } from './data'

export function useOperationFilter(
  key: 'event' | 'form',
  fallback = '',
  sync = true
): [string, (value: string) => void] {
  const search = useLocation({
    select: (location) => location.search as Record<string, unknown>,
  })
  const navigate = useNavigate()
  const requested = search[key]
  const value =
    typeof requested === 'string' &&
    (key !== 'form' || FORM_DEFS.some((form) => form.key === requested))
      ? requested
      : fallback
  const [localValue, setLocalValue] = useState(value)

  return [
    sync ? value : localValue,
    (next) => {
      if (!sync) {
        setLocalValue(next)
        return
      }
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, [key]: next }),
        replace: true,
        resetScroll: false,
        hash: true,
      })
    },
  ]
}
