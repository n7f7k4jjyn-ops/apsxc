import assert from 'node:assert/strict'
import test from 'node:test'
import { mapZigEventToApp } from './zig-event-map.mjs'
import { parseInstant } from './zig-matching.mjs'
import { planSalesEntries, summarizeSales } from './zig-sales.mjs'

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

test('caixa: categoria Vendas Zig e extras anotados nas observações sem entrar na receita', () => {
  const row = (extra) => ({ transactionId: 't', unitValue: 1000, count: 1, discountValue: 0, productCategory: 'Bar', eventId: 'E1', eventName: 'Noite', eventDate: '2026-10-23', type: 'Normal', isRefunded: false, ...extra })
  const summary = summarizeSales([row({}), row({ type: 'ZigCard', unitValue: 5000 }), row({ type: 'Tip', unitValue: 700 })], [row({ unitValue: 300 })], null)
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
