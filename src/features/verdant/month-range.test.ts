import { describe, expect, it } from 'vitest'
import { monthRange } from './month-range'
describe('month ranges', () => {
  it('includes leap days and both year boundaries', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthRange('2027-01')).toEqual({ from: '2027-01-01', to: '2027-01-31' })
  })
  it('clears an empty or invalid month', () => {
    for (const value of ['', '2026-13', '2026-00', '2026-1', '2026-10-01']) expect(monthRange(value)).toEqual({ from: '', to: '' })
  })
})
