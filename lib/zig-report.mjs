// Resumo por evento da Zig: casa, listas, receita e ticket médio. Independe de existir evento no app:
// sem evento do app a parte de listas fica vazia (null), mas público e receita vêm da própria Zig.
const sum = (...values) => values.reduce((total, value) => total + (value || 0), 0)

export function buildEventReports({ lojaId, conversion, sales, savedAt }) {
  const salesByEvent = new Map(sales.events.map((event) => [event.eventId, event]))
  return conversion.events.map((item) => {
    const sale = salesByEvent.get(item.zigEventId)
    const cents = (type) => sale?.types?.[type]?.cents ?? 0
    const consumptionCents = sum(...Object.values(sale?.types ?? {}).map((bucket) => bucket.cents))
    const totalCents = sum(...(sale?.billing || []).map(payment => payment.cents))
    const present = item.presentInHouse ?? 0
    const calculated = item.calculated === true
    return {
      key: `${lojaId}:${item.zigEventId}`,
      schemaVersion: 2, revenueSource: '/erp/faturamento', presenceSource: 'checkins-provisional-window',
      consumptionCents, billing: sale?.billing || [],
      lojaId, zigEventId: item.zigEventId, name: item.zigEventName || sale?.eventName || item.zigEventId,
      date: item.date, appEventId: calculated ? item.appEventId : null, appEventName: calculated ? item.appEventName : null,
      presentInHouse: present,
      registered: calculated ? item.registered : null,
      cameFromLists: calculated ? item.came : null,
      conversionPercent: calculated ? item.conversionPercent : null,
      walkInsWithoutList: calculated ? item.walkInsWithoutList : null,
      lists: calculated ? item.lists : [],
      salesAvailable: sale?.billingAvailable === true,
      totalCents,
      barCents: cents('Normal'), couvertCents: cents('Couvert'), entranceCents: cents('Entrance'),
      refundedCents: sale?.refundedCents ?? 0,
      excluded: Object.values(sale?.otherTypes ?? {}).map((bucket) => ({ type: bucket.type, cents: bucket.cents })),
      avgTicketCents: present > 0 && sale?.billingAvailable ? Math.round(totalCents / present) : null,
      avgBarCents: present > 0 && sale?.billingAvailable ? Math.round(cents('Normal') / present) : null,
      savedAt,
    }
  })
}

export function normalizeReportStore(value) {
  return { reports: Array.isArray(value?.reports) ? value.reports.filter((report) => typeof report?.key === 'string') : [] }
}

// Atualiza apenas as chaves informadas; relatórios de outros eventos nunca são removidos.
export function upsertReports(store, reports) {
  const byKey = new Map(store.reports.map((report) => [report.key, report]))
  let added = 0
  let updated = 0
  for (const report of reports) {
    if (byKey.has(report.key)) updated += 1
    else added += 1
    byKey.set(report.key, report)
  }
  return { store: { reports: [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date)) }, added, updated }
}
