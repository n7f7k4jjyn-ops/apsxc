import test from 'node:test'
import assert from 'node:assert/strict'
import { influencerPayoutRows } from '../src/features/verdant/influencer-payout-report.ts'

const admission = id => ({ id, eventId: 'event', eventDate: '2026-10-24', influencerId: 'person', rateCents: 300, confirmedAt: '2026-10-25T01:00:00Z', confirmedBy: 'door' })
const entry = (externalId, status) => ({ externalId, category: 'influencer', type: 'payable', amountCents: 300, eventId: 'event', beneficiaryId: 'influencer:person', status })
const finance = () => ({ events: [{ id: 'event', date: '2026-10-24', name: 'Evento teste' }], beneficiaries: [{ id: 'influencer:person', name: 'Influencer teste' }], entries: [] })
test('signup creates no payout and deduplicated admissions reconcile paid, pending, ungenerated and cancelled', () => {
  const data = finance(), source = { registrations: [{ id: 'r1', eventId: 'event', influencerId: 'person' }], admissions: [] }
  assert.equal(influencerPayoutRows(data, source)[0].earned, 0)
  source.admissions = ['one', 'two', 'three', 'four', 'one'].map(admission)
  data.entries = [entry('one', 'pending'), entry('two', 'settled'), entry('four', 'cancelled')]
  const row = influencerPayoutRows(data, source)[0]
  assert.equal(row.validated, 4); assert.equal(row.earned, 1200)
  assert.equal(row.pending, 300); assert.equal(row.paid, 300); assert.equal(row.cancelled, 300); assert.equal(row.toGenerate, 300)
  assert.equal(row.pending + row.paid + row.cancelled + row.toGenerate, row.earned)
})
test('filters use event date even when entry was confirmed after midnight; reject broken payment evidence', () => {
  const data = finance(), source = { registrations: [], admissions: [admission('one')] }
  assert.equal(influencerPayoutRows(data, source, { from: '2026-10-24', to: '2026-10-24', eventId: 'event' }).length, 1)
  assert.equal(influencerPayoutRows(data, source, { eventId: 'other' }).length, 0)
  assert.equal(influencerPayoutRows(data, source, { from: '2026-10-25' }).length, 0)
  data.entries.push({ ...entry('one', 'settled'), amountCents: 600 })
  assert.throws(() => influencerPayoutRows(data, source), /diverge/)
})
