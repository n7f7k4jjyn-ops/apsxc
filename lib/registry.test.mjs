import test from 'node:test'
import assert from 'node:assert/strict'
import { registryIdentity, groupRegistryClients, latestTeam, promotedTeam } from './registry.mjs'
test('identity joins the same name and contact, but keeps shared family phones separate',()=>{
 assert.equal(registryIdentity({name:'João Silva',phone:'+55 (41) 99999-9999'}),registryIdentity({name:'JOAO SILVA',whatsapp:'41999999999'}))
 assert.notEqual(registryIdentity({name:'João',phone:'41999999999'}),registryIdentity({name:'Maria',phone:'41999999999'}))
 assert.notEqual(registryIdentity({id:'a',name:'João'}),registryIdentity({id:'b',name:'João'}))
 const people=groupRegistryClients([{id:'1',name:'João',whatsapp:'41999999999',eventId:'a'},{id:'2',name:'João',whatsapp:'41999999999',eventId:'b'}])
 assert.equal(people.length,1); assert.equal(people[0].history.length,2)
})
test('team uses latest submission and preserves its earlier history',()=>{
 const rows=latestTeam([{id:'1',name:'Ana',whatsapp:'41999999999',createdAt:'2026-01-01',pixKey:'old'},{id:'2',name:'Ana',whatsapp:'41999999999',createdAt:'2026-02-01',pixKey:'new'}])
 assert.equal(rows.length,1);assert.equal(rows[0].pixKey,'new');assert.equal(rows[0].history.length,2)
})
test('promotion requires approval, reuses an existing member and preserves their Pix',()=>{
 const application={id:'job-1',name:'Ana',whatsapp:'41999999999',roles:['Bar'],availability:['Sábado'],experience:'Atendimento'}
 assert.throws(()=>promotedTeam(application),{status:409})
 const approved={...application,status:'approved'}
 const member=promotedTeam(approved)
 assert.equal(member.sourceApplicationId,application.id)
 assert.equal(promotedTeam(approved,[member]).id,member.id)
 const existing={...member,id:'existing',pixKey:'private'}
 assert.equal(promotedTeam(approved,[existing]).pixKey,'private')
})
