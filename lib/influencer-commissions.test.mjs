import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmInfluencerAdmission, planInfluencerCommissions } from './influencer-commissions.mjs'
import { changeFinance, emptyFinance } from './finance.mjs'

const state = () => ({ events: [{ id: 'event', date: '2026-10-23' }], people: [{ id: 'influencer', kind: 'INFLUENCIADORES' }], registrations: [{ id: 'r1', formKey: 'INFLUENCIADORES', name: 'Pessoa Teste', whatsapp: '41999999999', eventId: 'event', optionId: 'influencer' }] })
test('signup alone never generates commission; only door confirmation creates R$3 payable', () => {
  const s = state(), empty = emptyFinance()
  assert.deepEqual(planInfluencerCommissions({}, empty), [])
  const result = confirmInfluencerAdmission({}, s, 'r1', 'door', '2026-10-24T01:00:00Z')
  assert.equal(result.created, true)
  const entries = planInfluencerCommissions(result.document, empty)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].amountCents, 300)
  assert.equal(entries[0].status, 'pending')
  const references = { events: s.events, influencerAdmissions: result.document.influencerAdmissions, beneficiaries: [{ id: 'influencer:influencer', name: 'Influencer Teste', kind: 'influencer' }] }
  const saved = changeFinance(empty, { revision: 0, entries }, references, 'admin').document
  assert.throws(() => changeFinance(empty, { revision: 0, entries }, { ...references, influencerAdmissions: [] }, 'admin'), /entrada confirmada/)
  assert.throws(() => changeFinance(empty, { revision: 0, entries: [{ ...entries[0], amountCents: 600 }] }, references, 'admin'), /R\$ 3/)
  assert.deepEqual(planInfluencerCommissions(result.document, saved), [])
  assert.equal(saved.entries[0].counterparty, 'Influencer Teste')
})
test('repeat admission and duplicate signup never pay twice; different events remain independent', () => {
  const s = state()
  s.registrations.push({ ...s.registrations[0], id: 'r2', name: ' PESSOA TESTE ', whatsapp: '+55 (41) 99999-9999' })
  const first = confirmInfluencerAdmission({}, s, 'r1', 'door').document
  const again = confirmInfluencerAdmission(first, s, 'r2', 'door')
  assert.equal(again.created, false)
  assert.equal(again.document.influencerAdmissions.length, 1)
  s.events.push({ id: 'second', date: '2026-10-24' })
  s.registrations.push({ ...s.registrations[0], id: 'r3', eventId: 'second' })
  const second = confirmInfluencerAdmission(first, s, 'r3', 'door').document
  assert.equal(planInfluencerCommissions(second, emptyFinance()).length, 2)
})
test('multiple influencer attribution, missing phone and non-influencer list cannot create evidence', () => {
  const s = state()
  s.registrations.push({ ...s.registrations[0], id: 'r2', optionId: 'other' })
  assert.throws(() => confirmInfluencerAdmission({}, s, 'r1', 'door'), /diferentes/)
  s.registrations.pop(); s.registrations[0].whatsapp = ''
  assert.throws(() => confirmInfluencerAdmission({}, s, 'r1', 'door'), /identificação/)
  s.registrations[0].formKey = 'DJS'
  assert.throws(() => confirmInfluencerAdmission({}, s, 'r1', 'door'), /não encontrada/)
})
