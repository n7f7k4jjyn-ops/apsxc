import { describe, expect, it } from 'vitest'
import type { VerdantEvent } from './data'
import { eventOptions } from './event-options'

const events = [
  { id: 'old', date: '2026-09-10', name: 'Antigo', active: true },
  { id: 'today', date: '2026-10-24', name: 'Hoje', active: true },
  { id: 'future', date: '2026-10-25', name: 'Próximo', active: true },
  { id: 'archived', date: '2026-09-11', name: 'Arquivado', active: false },
] as VerdantEvent[]
const now = new Date('2026-10-25T01:00:00Z')
describe('event selection visibility', () => {
  it('hides past events by default using the Curitiba calendar date', () => {
    expect(eventOptions(events, '', '', now).map(event => event.id)).toEqual(['today', 'future'])
  })
  it('retrieves history for an explicit month, including archived events', () => {
    expect(eventOptions(events, '2026-09', '', now).map(event => event.id)).toEqual(['old', 'archived'])
  })
  it('keeps a historical deep link selected without showing unrelated history', () => {
    expect(eventOptions(events, '', 'old', now).map(event => event.id)).toEqual(['old', 'today', 'future'])
  })
})
