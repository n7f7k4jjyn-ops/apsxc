/** Normalize legacy entries that stored several guests in a single field. */
export function birthdayGuestNames(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value]
  return entries
    .flatMap((entry) => String(entry ?? '').split(/[\r\n,;]+/))
    .map((name) =>
      name
        .trim()
        .replace(/^\d+\s*[.)-]\s*/, '')
        .trim()
    )
    .filter(Boolean)
}

export function birthdayDoorGroup(name: string, guests: unknown) {
  const names = birthdayGuestNames(guests)
  return {
    label: `Aniversariante: ${name}`,
    hostName: name,
    names,
    summary: `${names.length} ${names.length === 1 ? 'convidado' : 'convidados'} + aniversariante = ${names.length + 1} pessoas`,
  }
}
