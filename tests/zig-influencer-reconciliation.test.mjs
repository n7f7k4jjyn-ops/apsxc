import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone } from '../lib/zig-matching.mjs'
import { reconcileInfluencerCheckins } from '../lib/zig-influencer-reconciliation.mjs'

const event = { id: 'verdant-event', name: 'Festa', date: '2026-10-24' }
const state = {
  events: [event],
  people: [{ id: 'influencer-one', kind: 'INFLUENCIADORES', name: 'Influencer' }],
  registrations: [{ id: 'registration-one', formKey: 'INFLUENCIADORES', eventId: event.id, optionId: 'influencer-one', name: 'Pessoa Teste', whatsapp: '41999999999' }],
}
const person = (changes = {}) => ({
  zigId: 'zig-person', name: 'Pessoa Teste', phone: normalizePhone('41999999999'),
  checkins: 1, sources: new Set(['checkin']), eventIds: new Set(['zig-event']), checkinEventIds: new Set(['zig-event']), ...changes,
})
test('confirmed Zig check-in creates exactly one admission, including repeated syncs', () => {
  const first = reconcileInfluencerCheckins({}, state, [person()], { 'zig-event': event.id }, 'master')
  assert.equal(first.confirmed.length, 1)
  assert.equal(first.document.influencerAdmissions.length, 1)
  const repeated = reconcileInfluencerCheckins(first.document, state, [person()], { 'zig-event': event.id }, 'master')
  assert.equal(repeated.confirmed.length, 0)
  assert.equal(repeated.document.influencerAdmissions.length, 1)
})
test('purchase without check-in, ambiguous event, and missing link never confirm', () => {
  const buyer = reconcileInfluencerCheckins({}, state, [person({ checkins: 0, sources: new Set(['buyer']) })], { 'zig-event': event.id }, 'master')
  assert.equal(buyer.confirmed.length, 0)
  assert.equal(reconcileInfluencerCheckins({}, state, [person({ checkinEventIds: new Set(['a','b']) })], {}, 'master').confirmed.length, 0)
  assert.equal(reconcileInfluencerCheckins({}, state, [person()], {}, 'master').confirmed.length, 0)
})
test('no name-only match and no conflicting influencer attribution', () => {
  const wrongPhone = reconcileInfluencerCheckins({}, state, [person({ phone: normalizePhone('41988888888') })], { 'zig-event': event.id }, 'master')
  assert.equal(wrongPhone.confirmed.length, 0)
  const conflict = { ...state, people: [...state.people, { id: 'influencer-two', kind: 'INFLUENCIADORES' }], registrations: [...state.registrations, { ...state.registrations[0], id: 'registration-two', optionId: 'influencer-two' }] }
  assert.equal(reconcileInfluencerCheckins({}, conflict, [person()], { 'zig-event': event.id }, 'master').confirmed.length, 0)
})
