import { useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { monthRange } from './month-range'

export function useOperationMonth(sync = true, resetEvent = true): [string, (month: string) => void] {
  const requested = useLocation({ select: location => (location.search as Record<string, unknown>).month })
  const month = typeof requested === 'string' && monthRange(requested).from ? requested : ''
  const [localMonth, setLocalMonth] = useState(month)
  const navigate = useNavigate()
  return [sync ? month : localMonth, value => {
    if (!sync) { setLocalMonth(value); return }
    void navigate({ to: '.', search: previous => ({ ...previous, month: value, ...(resetEvent ? { event: '' } : {}) }), replace: true, resetScroll: false, hash: true })
  }]
}
