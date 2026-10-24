import assert from 'node:assert/strict'
import test from 'node:test'
import { applyDjLine, djLineRows, djLineSections, djGuests, validateDjOrder } from '../src/features/verdant/dj-line.ts'
import { createPortariaPdf } from '../src/features/verdant/portaria-pdf.ts'

const fixture = () => ({ events: [{ id: 'event', date: '2026-10-24', name: 'Noite', eventTime: '22:00' }], people: [
  { id: 'a', kind: 'DJ', name: 'DJ Primeiro', active: false, eventIds: ['event'], eventDetails: { event: { track: 'SKY', order: 2, time: '23:00' } } },
  { id: 'b', kind: 'DJ', name: 'DJ Segundo', active: true, eventIds: ['event'], eventDetails: { event: { track: 'SKY', order: 1, time: '01:00' } } },
  { id: 'c', kind: 'DJ', name: 'DJ Outro', active: true, eventIds: ['other'], eventDetails: {} },
], registrations: [{ id: 'registration', formKey: 'DJS', eventId: 'event', optionId: 'a', optionName: 'Nome antigo', name: 'Convidado teste' }, { id: 'another', formKey: 'DJS', eventId: 'other', optionId: 'a', name: 'Outro evento' }] })
test('line follows saved order or overnight time and keeps linked historical DJs', () => {
  assert.deepEqual(djLineRows(fixture(), 'event').map(r => r.id), ['b', 'a'])
  assert.deepEqual(djLineRows(fixture(), 'event', 'time').map(r => r.id), ['a', 'b'])
})
test('guest list resolves DJ by identifier after name changes, without mixing events', () => {
  const guests = djGuests(fixture(), 'event')
  assert.equal(guests.length, 1)
  assert.equal(guests[0].professional, 'DJ Primeiro')
})
test('order rejects duplicates in a track but allows independent numbering per track', () => {
  const rows = djLineRows(fixture(), 'event')
  validateDjOrder(rows)
  rows[1].order = rows[0].order
  assert.throws(() => validateDjOrder(rows), /repetida/)
  rows[1].track = 'LAND'; validateDjOrder(rows)
  rows[1].order = 1.5; assert.throws(() => validateDjOrder(rows), /inteira/)
})
test('line PDF contains schedule sections and no guest list', async () => {
  const sections = djLineSections(djLineRows(fixture(), 'event'))
  assert.equal(sections[0].groups[0].names[0], '1. DJ Segundo | 01:00')
  assert.equal(JSON.stringify(sections).includes('Convidado'), false)
  const pdf = await createPortariaPdf({ eventName: 'Noite', eventDate: '24/10/2026', reportLabel: 'Line de DJs', sections })
  assert.ok(pdf.length > 500)
})

test('second set appears in print and replacement retains historical registrations and independent track order', () => {
 const state=fixture()
 const rows=djLineRows(state,'event').map(row=>({...row,originalId:row.id,secondTime:'03:00'}))
 rows[0]={...rows[0],id:'c',name:'DJ Outro',track:'LAND'}
 const next=applyDjLine(state,'event',rows)
 assert.equal(next.people.find(p=>p.id==='c').eventDetails.event.secondTime,'03:00')
 assert.equal(next.people.find(p=>p.id==='b').eventIds.includes('event'),false)
 assert.deepEqual(next.registrations,state.registrations)
 assert.equal(state.people.find(p=>p.id==='b').eventIds.includes('event'),true)
 assert.match(djLineSections(djLineRows(next,'event'))[0].groups[0].names[0],/2º: 03:00/)
 assert.throws(()=>applyDjLine(state,'event',[rows[0],{...rows[1],id:'c',track:'LAND'}]),/mesmo DJ/)
})

test('same DJ on SKY and LAND keeps independent sets through edit and print',()=>{
 const state=fixture();state.people[0].eventDetails.event.additionalSets=[{track:'LAND',order:1,time:'02:00',secondTime:'04:00'}]
 const rows=djLineRows(state,'event')
 assert.equal(rows.filter(row=>row.id==='a').length,2)
 const edited=applyDjLine(state,'event',rows.map(row=>({...row,originalId:row.slotKey,originalPersonId:row.id})))
 assert.equal(djLineRows(edited,'event').filter(row=>row.id==='a').length,2)
 assert.equal(djLineSections(djLineRows(edited,'event')).length,2)
 assert.deepEqual(edited.registrations,state.registrations)
})
