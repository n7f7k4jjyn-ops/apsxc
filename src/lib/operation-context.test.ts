import { describe, expect, it } from 'vitest'
import { operationContext } from './operation-context'

describe('shared operation navigation', () => {
  it('keeps explicit cleared filters and never carries page-specific values', () => {
    expect(
      operationContext(
        { event: '', month: '2026-10', form: 'VIP', token: 'private' },
        '/verdant/financeiro'
      )
    ).toEqual({ event: '', month: '2026-10' })
  })
  it('does not attach operation filters to account and administration pages', () => {
    expect(
      operationContext({ event: 'event-1', month: '2026-10' }, '/settings')
    ).toEqual({})
  })
  it('does not mistake summary-only selections for real event IDs', () => {
    expect(
      operationContext({ event: 'all', month: '2026-13' }, '/verdant/listas')
    ).toEqual({ event: '' })
    expect(operationContext({ event: 'event-1' }, '/')).toEqual({
      event: 'event-1',
    })
  })
})
