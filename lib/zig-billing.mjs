import { ZigError } from './zig-client.mjs'

export function summarizeBilling(rows, { lojaId, redeId, allowedEventIds }) {
  const events = new Map(), seen = new Set()
  for (const row of rows) {
    if (String(row?.lojaId ?? '') !== String(lojaId)) throw new ZigError('A Zig retornou faturamento de outra loja. Resultado descartado.', { code: 'zig_store_mismatch', status: 422 })
    if (redeId && String(row?.redeId ?? '') !== String(redeId)) throw new ZigError('A Zig retornou faturamento de outra rede. Resultado descartado.', { code: 'zig_store_mismatch', status: 422 })
    const eventId = String(row?.eventId ?? '')
    if (!eventId) throw new ZigError('Faturamento sem evento. Resultado descartado.', { code: 'invalid_billing', status: 422 })
    if (!allowedEventIds.has(eventId)) continue
    if (!Number.isSafeInteger(row.value) || row.value < 0 || !Number.isSafeInteger(row.paymentId) || row.paymentId < 0 || !String(row.paymentName || '').trim()) throw new ZigError('Faturamento com valor ou forma de pagamento inválida.', { code: 'invalid_billing', status: 422 })
    const key = `${eventId}:${row.paymentId}`
    if (seen.has(key)) throw new ZigError('A Zig retornou faturamento repetido por evento e forma de pagamento. Resultado descartado.', { code: 'duplicate_billing', status: 422 })
    seen.add(key)
    const payments = events.get(eventId) || []
    if (!Number.isSafeInteger(payments.reduce((sum, payment) => sum + payment.cents, row.value))) throw new ZigError('Total de faturamento fora do limite monetário.', { code: 'invalid_billing', status: 422 })
    payments.push({ paymentId: row.paymentId, paymentName: row.paymentName.trim(), cents: row.value })
    events.set(eventId, payments)
  }
  for (const payments of events.values()) payments.sort((a,b) => a.paymentId - b.paymentId)
  return events
}

export function billingMethod(name) {
  const value = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (value.includes('pix')) return 'pix'
  if (value.includes('dinheiro')) return 'cash'
  if (/cartao|credito|debito/.test(value)) return 'card'
  if (value.includes('transferencia')) return 'transfer'
  return 'other'
}
