import { describe, expect, it } from 'vitest'
import { getCalendarDays } from './calendar-utils'

describe('calendário mensal', () => {
  it('alinha a semana na segunda-feira e completa semanas inteiras', () => {
    const days = getCalendarDays(2026, 1)

    expect(days).toHaveLength(35)
    expect(days.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(days[6]).toBe(1)
    expect(days.filter((day) => day !== null)[27]).toBe(28)
  })

  it('acomoda meses de 31 dias sem perder o último dia', () => {
    const days = getCalendarDays(2026, 7)

    expect(days).toHaveLength(42)
    expect(days.filter((day) => day !== null)).toHaveLength(31)
    expect(days.filter((day) => day !== null)[30]).toBe(31)
  })
})
