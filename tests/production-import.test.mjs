import test from 'node:test'
import assert from 'node:assert/strict'
import { readProductionBundle, planProductionImport } from '../src/features/verdant/production-import.ts'

const fixture = () => ({ schemaVersion: 1, people: [{ id: 'dj1', name: 'Teste DJ', phone: '', pixKey: 'pix', beneficiary: 'Teste' }], team: [], engagements: [{ id: 'gig1', personId: 'dj1', name: 'Teste DJ', date: '2026-10-23', event: '', track: 'SKY', order: 1, time: '23:00', financialReview: [], sources: [] }], finance: [{ externalId: 'gig1', personId: 'dj1', eventKey: '2026-10-23|', type: 'payable', category: 'dj', description: 'Cachê', amountCents: 30000, dueDate: '2026-10-23', status: 'pending', settledDate: '', paymentMethod: '', notes: '' }] })
const emptyState = () => ({ events: [], people: [], forms: [], registrations: [], revision: 0, version: 7, updatedAt: '' })
const finance = () => ({ entries: [], events: [], beneficiaries: [], revision: 0 })
test('production import reuses deterministic events, DJs, gigs and finance IDs', () => {
  const b = readProductionBundle(fixture())
  const first = planProductionImport(b, emptyState(), [], finance())
  assert.equal(first.newEvents, 1); assert.equal(first.newPeople, 1); assert.equal(first.entries.length, 1)
  assert.equal(first.state.events[0].active, false)
  assert.equal(first.state.people[0].eventDetails[first.state.events[0].id].time, '23:00')
  const again = planProductionImport(b, first.state, [], { ...finance(), entries: first.entries })
  assert.equal(again.newEvents, 0); assert.equal(again.newPeople, 0); assert.equal(again.entries.length, 0)
})
test('unknown same-day event and earlier manual payable are held for reconciliation', () => {
  const b = readProductionBundle(fixture()), s = emptyState()
  s.events.push({ id: 'other', date: '2026-10-23', name: 'Outra festa' })
  assert.equal(planProductionImport(b, s, [], finance()).entries.length, 0)
  const first = planProductionImport(b, emptyState(), [], finance())
  const manual = { ...first.entries[0], externalId: 'manual' }
  const held = planProductionImport(b, first.state, [], { ...finance(), entries: [manual] })
  assert.equal(held.entries.length, 0); assert.ok(held.issues.length)
})
test('malformed records and source conflicts cannot enter finance', () => {
  const b = fixture(); b.finance[0].amountCents = -1
  assert.throws(() => readProductionBundle(b))
  const c = fixture(); c.engagements[0].financialReview.push('conflito')
  assert.throws(() => readProductionBundle(c))
  const d = fixture(); d.people[0].conflicts = ['pixKey']
  const result = planProductionImport(readProductionBundle(d), emptyState(), [], finance())
  assert.equal(result.entries.length, 0); assert.equal(result.newPeople, 0)
})
