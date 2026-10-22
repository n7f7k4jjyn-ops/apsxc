import assert from 'node:assert/strict'
import { test } from 'node:test'
import { migrateVerdantState } from '../lib/verdant-state-migration.mjs'

const base = () => ({
  version: 2,
  events: [{ id: 'event-2026-10-11', name: 'Domingo', date: '2026-10-11', active: true }],
  forms: [],
  people: [{ id: 'dj-fredo', kind: 'DJ', name: 'Fredo', eventIds: ['event-2026-10-11'], eventDetails: {} }],
  registrations: [{ id: 'r1' }],
})

test('migração da semana é aditiva e idempotente', () => {
  const first = migrateVerdantState(base(), { people: [] })
  assert.equal(first.state.version, 3)
  assert.equal(first.state.events.length, 5)
  assert.equal(first.state.registrations.length, 1)
  const fredo = first.state.people.filter((person) => person.id === 'dj-fredo')
  assert.equal(fredo.length, 1)
  assert.deepEqual(fredo[0].eventIds, ['event-2026-10-11', 'event-2026-10-17'])
  const second = migrateVerdantState(first.state, { people: [] })
  assert.equal(second.changed, false)
})

test('sem valores inventados: ressaka sem line-up e 15/10 sem lista de DJs', () => {
  const { state } = migrateVerdantState(base(), { people: [] })
  assert.equal(state.people.some((person) => person.eventIds.includes('event-2026-10-18')), false)
  const form = (id) => state.forms.find((item) => item.id === id)
  assert.equal(form('DJS-event-2026-10-15').enabled, false)
  for (const key of ['DJS','INFLUENCIADORES','LISTA_LOVERS','VIP','ANIVERSARIO']) assert.equal(form(`${key}-event-2026-10-18`).enabled, false)
  for (const day of ['15','16','17']) assert.equal(form(`VIP-event-2026-10-${day}`).enabled, true)
  assert.equal(form('LISTA_LOVERS-event-2026-10-16').enabled, false)
  assert.equal(form('LISTA_LOVERS-event-2026-10-17').price, 70)
  assert.equal(form('ANIVERSARIO-event-2026-10-15').enabled, false)
  assert.equal(form('ANIVERSARIO-event-2026-10-17').cutoff, '15:00')
})
