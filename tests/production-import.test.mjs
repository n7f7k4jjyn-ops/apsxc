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

test('event display prefixes and known aliases reuse the event; explicit choices require the same date',()=>{
 const bundle=fixture();bundle.engagements[0].event='FRENÉTIKA';bundle.finance[0].eventKey='2026-10-23|frenetika'
 const state=emptyState();state.events=[{id:'party',date:'2026-10-23',name:'Sexta · FRENÉTIKA'}]
 const result=planProductionImport(readProductionBundle(bundle),state,[],finance())
 assert.equal(result.newEvents,0);assert.equal(result.entries[0].eventId,'party')
 state.events[0].name='Sexta · 23/10/2026'
 const pending=planProductionImport(bundle,state,[],finance());assert.equal(pending.eventBindings.length,1)
 const resolved=planProductionImport(bundle,state,[],finance(),{'2026-10-23|frenetika':'party'})
 assert.equal(resolved.entries.length,1);assert.equal(resolved.eventBindings.length,0)
 assert.throws(()=>planProductionImport(bundle,state,[],finance(),{'2026-10-23|frenetika':'missing'}),/inválido/)
})
test('multiple tracks are retained and reimport never duplicates them or their payable',()=>{
 const bundle=fixture();bundle.engagements.push({...bundle.engagements[0],id:'gig2',track:'LAND',time:'01:00'})
 const first=planProductionImport(readProductionBundle(bundle),emptyState(),[],finance())
 const detail=first.state.people[0].eventDetails[first.state.events[0].id]
 assert.equal(detail.track,'SKY');assert.equal(detail.additionalSets[0].track,'LAND');assert.equal(detail.additionalSets[0].time,'01:00')
 assert.equal(first.issues.some(issue=>issue.includes('Mais de uma pista')),false)
 const again=planProductionImport(bundle,first.state,[],{...finance(),entries:first.entries})
 assert.equal(again.state.people[0].eventDetails[first.state.events[0].id].additionalSets.length,1);assert.equal(again.entries.length,0)
})

test('authorized historical creation preserves existing events, finance values and no conversion data',()=>{
 const bundle=fixture();bundle.engagements[0].event='Festa de julho';bundle.engagements[0].date='2026-07-04';bundle.finance[0].dueDate='2026-07-04';bundle.finance[0].eventKey='2026-07-04|festa de julho'
 const state=emptyState();state.events=[{id:'old-calendar',date:'2026-07-04',name:'Sábado · 04/07/2026',active:true}]
 const before=structuredClone(state)
 const result=planProductionImport(readProductionBundle(bundle),state,[],finance(),{},true)
 assert.equal(result.newEvents,1);assert.equal(result.entries.length,1);assert.equal(result.entries[0].amountCents,30000)
 const historical=result.state.events.find(event=>event.id!== 'old-calendar')
 assert.equal(historical.date,'2026-07-04');assert.equal(historical.active,false);assert.equal(historical.conversion,undefined)
 assert.deepEqual(result.state.registrations,[]);assert.deepEqual(state,before)
 const again=planProductionImport(bundle,result.state,[],{...finance(),entries:result.entries},{},true)
 assert.equal(again.newEvents,0);assert.equal(again.entries.length,0)
})
