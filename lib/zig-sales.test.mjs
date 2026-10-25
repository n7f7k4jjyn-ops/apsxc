import assert from 'node:assert/strict'
import test from 'node:test'
import { mapZigEventToApp } from './zig-event-map.mjs'
import { parseInstant } from './zig-matching.mjs'
import { planSalesEntries, summarizeSales, collectZigSales, salesFingerprint } from './zig-sales.mjs'
import { buildEventReports, upsertReports } from './zig-report.mjs'

const apps = [
  { id: 'a23', date: '2026-10-23', eventTime: '22:00' },
  { id: 'a24', date: '2026-10-24', eventTime: '22:00' },
]

test('mapeia pelo horário de início: duas noites seguidas não se misturam', () => {
  assert.equal(mapZigEventToApp(parseInstant('2026-10-23T22:00:00'), apps).appEvent.id, 'a23')
  assert.equal(mapZigEventToApp(parseInstant('2026-10-24T22:30:00'), apps).appEvent.id, 'a24')
  assert.equal(mapZigEventToApp(parseInstant('2026-10-24T08:00:00'), apps).appEvent, null)
})

test('mapeia por horário mesmo com dois eventos do app no mesmo dia', () => {
  const same = [{ id: 'tarde', date: '2026-10-24', eventTime: '14:00' }, { id: 'noite', date: '2026-10-24', eventTime: '22:00' }]
  assert.equal(mapZigEventToApp(parseInstant('2026-10-24T22:00:00'), same).appEvent.id, 'noite')
  assert.equal(mapZigEventToApp(parseInstant('2026-10-24T14:10:00'), same).appEvent.id, 'tarde')
  assert.equal(mapZigEventToApp(null, same).appEvent, null)
})

test('resumo: evento passado sem evento no app mantém casa, receita e ticket; listas ficam vazias', () => {
  const conversion = { events: [{ zigEventId: 'E9', zigEventName: 'Antigo', date: '2026-01-10', appEventId: null, calculated: false, presentInHouse: 100 }] }
  const sales = { events: [{ eventId: 'E9', eventName: 'Antigo', billingAvailable: true, billing: [{ paymentId: 1, paymentName: 'Pix', cents: 100000 }], types: { Normal: { cents: 80000 }, Entrance: { cents: 20000 } }, otherTypes: {}, refundedCents: 0 }] }
  const [report] = buildEventReports({ lojaId: 'L1', conversion, sales, savedAt: 'x' })
  assert.equal(report.registered, null)
  assert.equal(report.conversionPercent, null)
  assert.equal(report.presentInHouse, 100)
  assert.equal(report.totalCents, 100000)
  assert.equal(report.avgTicketCents, 1000)
  const first = upsertReports({ reports: [{ key: 'L1:OUTRO', date: '2026-01-01' }] }, [report])
  assert.equal(first.store.reports.length, 2)
  assert.deepEqual([first.added, first.updated], [1, 0])
})

test('caixa: categoria Vendas Zig e extras anotados nas observações sem entrar na receita', () => {
  const row = (extra) => ({ transactionId: 't', unitValue: 1000, count: 1, discountValue: 0, productCategory: 'Bar', eventId: 'E1', eventName: 'Noite', eventDate: '2026-10-23', type: 'Normal', isRefunded: false, ...extra })
  const summary = summarizeSales([row({}), row({ type: 'ZigCard', unitValue: 5000 }), row({ type: 'Tip', unitValue: 700 })], [row({ unitValue: 300 })], null)
  summary.events[0].billingAvailable = true
  summary.events[0].billing = [{ paymentId: 1, paymentName: 'Pix', cents: 1000 }]
  summary.events[0].beginMs = parseInstant('2026-10-23T22:00:00')
  const plan = planSalesEntries(summary, { lojaId: 'L1', appEvents: apps })
  assert.equal(plan.creates.length, 1)
  const [entry] = plan.creates
  assert.equal(entry.category, 'sales')
  assert.equal(entry.amountCents, 1000)
  assert.equal(entry.eventId, 'a23')
  assert.match(entry.notes, /Recargas ZigCard: R\$ 50,00/)
  assert.match(entry.notes, /Gorjetas: R\$ 7,00/)
  assert.match(entry.notes, /Estornos: R\$ 3,00/)
})

test('quantidade fracionada preservada no cálculo', () => {
  const row = { eventId: 'E1', eventDate: '2026-10-17', type: 'Normal', unitValue: 1500, count: 0.5, discountValue: 0 }
  assert.equal(summarizeSales([row], [], null).events[0].types.Normal.cents, 750)
})

test('valor inválido bloqueia a importação', () => {
  const row = { eventId: 'E1', eventDate: '2026-10-17', type: 'Normal', unitValue: 'invalid', count: 1, discountValue: 0 }
  assert.throws(() => summarizeSales([row], [], null), /Valor monetário inválido/)
})

test('faturamento oficial e consumo permanecem separados com centavos inteiros', async () => {
  const calls = []
  const data = await collectZigSales({ lojaId: 'L1', dtinicio: '2026-10-23', dtfim: '2026-10-23', now: Date.parse('2026-11-01T00:00Z'), client: {
    listEvents: async () => [{ id:'E1', name:'Frenétika', beginAt:'2026-10-24T01:00:00Z' }],
    listSales: async (_store,_from,_to,refunded) => refunded ? [] : [{ eventId:'E1',eventDate:'2026-10-23',type:'Normal',unitValue:1500,count:2,discountValue:0 }],
    listBilling: async (...args) => { calls.push(args); return [{ lojaId:'L1',eventId:'E1',paymentId:1,paymentName:'Pix',value:3069374 }] },
  } })
  assert.equal(calls.length,1)
  assert.equal(data.events[0].eventDate,'2026-10-23')
  assert.equal(data.events[0].types.Normal.cents,3000)
  assert.equal(data.events[0].billing[0].cents,3069374)
  const plan=planSalesEntries(data,{lojaId:'L1',appEvents:apps})
  assert.equal(plan.creates[0].amountCents,3069374)
  assert.equal(plan.creates[0].paymentMethod,'pix')
  assert.equal(plan.creates[0].eventId,'a23')
  const first=salesFingerprint(data,plan)
  data.events[0].billing[0].cents++
  assert.notEqual(salesFingerprint(data,planSalesEntries(data,{lojaId:'L1',appEvents:apps})),first)
})

test('horário local e horário UTC equivalente mapeiam a mesma noite', () => {
  assert.equal(parseInstant('2026-10-23T22:00:00'),parseInstant('2026-10-24T01:00:00Z'))
  const adjacent=[...apps,{id:'madrugada',date:'2026-10-24',eventTime:'02:00'}]
  assert.equal(mapZigEventToApp(parseInstant('2026-10-24T01:00:00Z'),adjacent).appEvent.id,'a23')
})

test('valor ausente, vazio, booleano ou desconto superior ao bruto não vira zero', () => {
  const row={eventId:'E',type:'Normal',eventDate:'2026-10-23',unitValue:1000,count:1,discountValue:0}
  for(const value of [null,undefined,'',true]) assert.throws(()=>summarizeSales([{...row,unitValue:value}],[],null),/ausente|inválido/)
  assert.throws(()=>summarizeSales([{...row,discountValue:1001}],[],null),/inválido/)
})

test('lançamento antigo de consumo bloqueia nova receita para evitar duplicidade', () => {
  const event={eventId:'E1',eventDate:'2026-10-23',beginMs:parseInstant('2026-10-23T22:00:00'),types:{},otherTypes:{},billingAvailable:true,billing:[{paymentId:1,paymentName:'Pix',cents:2000}]}
  const plan=planSalesEntries({events:[event]},{lojaId:'L1',appEvents:apps,existingEntries:[{externalId:'zig:sales:L1:E1:Normal',amountCents:1000,status:'settled'}]})
  assert.equal(plan.creates.length,0)
  assert.equal(plan.conflicts.length,1)
})

test('faturamento de outra loja, duplicado ou com valor inválido é recusado', async () => {
  const {summarizeBilling}=await import('./zig-billing.mjs')
  const scope={lojaId:'L1',allowedEventIds:new Set(['E'])}
  const row={lojaId:'L1',eventId:'E',paymentId:1,paymentName:'Pix',value:1000}
  assert.throws(()=>summarizeBilling([{...row,lojaId:'L2'}],scope),/outra loja/)
  assert.throws(()=>summarizeBilling([row,row],scope),/repetido/)
  assert.throws(()=>summarizeBilling([{...row,value:null}],scope),/inválida/)
})
