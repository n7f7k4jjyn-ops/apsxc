import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRoster } from './rosters.mjs'
import { registryIdentity } from './registry.mjs'
const person={id:'member-1',name:'Nome Real',whatsapp:'41999999999',roles:['Segurança'],availability:['Domingo']}
const operations={teamStatuses:{[registryIdentity(person)]:{status:'active'}}}
const value={kind:'security',template:1,status:'finalized',date:'2026-12-31',eventId:'',entries:[{memberId:person.id,role:'Segurança',posts:['Revista','Apoio','Apoio'],entry:'22:00',exit:'07:00'}]}
test('roster preserves source identity, multiple posts and next-year overnight exit',()=>{
 const result=validateRoster(value,[person],operations,[])
 assert.equal(result.entries[0].exitDate,'2027-01-01')
 assert.deepEqual(result.entries[0].posts,['Revista','Apoio'])
 assert.equal(result.entries[0].name,'Nome Real')
})
test('roster validates unknown posts, malformed rows, event date and inactive members',()=>{
 for(const entries of [[null],[{...value.entries[0],posts:['Unknown']}],[{...value.entries[0],entry:'24:00'}]]) assert.throws(()=>validateRoster({...value,entries},[person],operations,[]),e=>e.status===400)
 assert.throws(()=>validateRoster({...value,eventId:'event'},[person],operations,[{id:'event',date:'2026-12-30'}]),e=>e.status===400)
 assert.throws(()=>validateRoster(value,[person],{teamStatuses:{}},[]),e=>e.status===409)
 assert.equal(validateRoster({...value,entries:[],status:'draft'},[],operations,[]).entries.length,0)
})
