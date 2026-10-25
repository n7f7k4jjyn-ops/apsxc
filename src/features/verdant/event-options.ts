
/** Historical dates stay available only for an explicit month or deep link. */
export function eventOptions<T extends { id: string; name: string; date: string; active?: boolean }>(
  events: T[],
  month = '',
  selectedId = '',
  now = new Date()
) {
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
  }).format(now)
  return events
    .filter(
      (event) =>
        event.id === selectedId ||
        (month
          ? event.date.startsWith(month)
          : event.active !== false && event.date >= today)
    )
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pt-BR')
    )
}
