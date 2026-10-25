import type { FinanceData } from './finance-data'

export type PayoutAdmissions = {
  admissions: {
    id: string
    eventId: string
    eventDate: string
    influencerId: string
    rateCents: number
    confirmedAt: string
    confirmedBy: string
  }[]
  registrations: { id: string; eventId: string; influencerId: string; eventDate?: string; eventName?: string }[]
}
export type PayoutRow = {
  eventId: string
  event: string
  date: string
  influencerId: string
  influencer: string
  registered: number
  validated: number
  earned: number
  toGenerate: number
  pending: number
  paid: number
  cancelled: number
}

export function influencerPayoutRows(
  finance: FinanceData,
  source: PayoutAdmissions,
  { eventId = '', from = '', to = '' } = {}
): PayoutRow[] {
  if (
    (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
    (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) ||
    (from && to && from > to)
  )
    throw new Error('Confira o período do relatório.')
  const rows = new Map<string, PayoutRow>()
  function get(id: string, personId: string, fallbackDate = '', fallbackName = '') {
    const event = finance.events.find((e) => e.id === id)
    const date = event?.date || fallbackDate
    if (
      (eventId && eventId !== id) ||
      (from && date < from) ||
      (to && date > to)
    )
      return
    const key = JSON.stringify([id, personId])
    if (!rows.has(key))
      rows.set(key, {
        eventId: id,
        event: event?.name || fallbackName || 'Evento indisponível',
        date,
        influencerId: personId,
        influencer:
          finance.beneficiaries.find((b) => b.id === `influencer:${personId}`)
            ?.name ||
          finance.entries.find(
            (e) => e.beneficiaryId === `influencer:${personId}`
          )?.counterparty ||
          'Influencer indisponível',
        registered: 0,
        validated: 0,
        earned: 0,
        toGenerate: 0,
        pending: 0,
        paid: 0,
        cancelled: 0,
      })
    return rows.get(key)!
  }
  const seenRegistrations = new Set<string>()
  for (const registration of source.registrations) {
    if (!registration.influencerId)
      throw new Error(
        'Atualize o aplicativo para carregar os vínculos das inscrições.'
      )
    if (seenRegistrations.has(registration.id)) continue
    seenRegistrations.add(registration.id)
    const row = get(registration.eventId, registration.influencerId, registration.eventDate, registration.eventName)
    if (row) row.registered++
  }
  const seen = new Set<string>()
  for (const admission of source.admissions) {
    if (seen.has(admission.id)) continue
    seen.add(admission.id)
    if (
      admission.rateCents !== 300 ||
      !admission.confirmedAt ||
      !admission.confirmedBy
    )
      throw new Error(
        'Entrada sem evidência válida; revise antes de gerar o relatório.'
      )
    const row = get(
      admission.eventId,
      admission.influencerId,
      admission.eventDate
    )
    if (!row) continue
    row.validated++
    row.earned += 300
    const entries = finance.entries.filter((e) => e.externalId === admission.id)
    if (entries.length > 1)
      throw new Error('Repasse duplicado no financeiro; revise os lançamentos.')
    const entry = entries[0]
    if (!entry) row.toGenerate += 300
    else {
      if (
        entry.category !== 'influencer' ||
        entry.type !== 'payable' ||
        entry.amountCents !== 300 ||
        entry.eventId !== admission.eventId ||
        entry.beneficiaryId !== `influencer:${admission.influencerId}`
      )
        throw new Error(
          'Repasse diverge da entrada confirmada; revise o vínculo e o valor.'
        )
      if (entry.status === 'settled') row.paid += entry.amountCents
      else if (entry.status === 'pending') row.pending += entry.amountCents
      else if (entry.status === 'cancelled') row.cancelled += entry.amountCents
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.event.localeCompare(b.event, 'pt-BR') ||
      a.influencer.localeCompare(b.influencer, 'pt-BR')
  )
}
