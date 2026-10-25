// Carry only shared operation filters, never page-specific or private values.
export function operationContext(
  search: Record<string, unknown> = {},
  destination: string
) {
  if (destination !== '/' && !destination.startsWith('/verdant/')) return {}
  return {
    ...(typeof search.event === 'string'
      ? { event: ['all', 'next'].includes(search.event) ? '' : search.event }
      : {}),
    ...(typeof search.month === 'string' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
      ? { month: search.month }
      : {}),
  }
}
