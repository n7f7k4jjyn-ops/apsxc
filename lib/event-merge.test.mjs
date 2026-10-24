import test from 'node:test'
import assert from 'node:assert/strict'
import { planEventMerge } from './event-merge.mjs'

const base = () => ({
  events: [
    { id: 'a', name: 'GOSTOSO', date: '2026-10-24', active: true },
    { id: 'b', name: 'Gostoso', date: '2026-10-24', active: true },
  ],
  forms: [
    { id: 'DJS-a', key: 'DJS', eventId: 'a', enabled: true },
    { id: 'DJS-b', key: 'DJS', eventId: 'b', enabled: true },
    { id: 'VIP-b', key: 'VIP', eventId: 'b', enabled: true },
  ],
  people: [{ id: 'p', eventIds: ['a', 'b'], eventDetails: { b: { order: 1 } } }, { id: 'q', eventIds: ['b'], eventDetails: {} }],
  registrations: [{ id: 'r1', eventId: 'b', eventName: 'Gostoso' }, { id: 'r2', eventId: 'a' }],
})

test('mescla sem apagar nada', () => {
  const input = base()
  const { state, report } = planEventMerge(input, 'a', 'b', 'now')
  assert.equal(input.registrations[0].eventId, 'b')
  assert.equal(state.registrations.length, 2)
  assert.ok(state.registrations.every((r) => r.eventId === 'a'))
  assert.equal(state.events.length, 2)
  assert.equal(state.events[1].active, false)
  assert.equal(state.forms.length, 3)
  assert.equal(state.forms.find((f) => f.id === 'DJS-b').enabled, false)
  assert.equal(state.forms.find((f) => f.key === 'VIP').eventId, 'a')
  assert.deepEqual(state.people[0].eventIds, ['a'])
  assert.deepEqual(state.people[0].eventDetails, { a: { order: 1 } })
  assert.equal(report.registrations, 1)
  assert.equal(report.people, 2)
})

test('recusa eventos iguais ou inexistentes', () => {
  assert.throws(() => planEventMerge(base(), 'a', 'a'))
  assert.throws(() => planEventMerge(base(), 'a', 'z'))
})
