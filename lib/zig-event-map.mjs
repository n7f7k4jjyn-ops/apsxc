import { parseInstant } from './zig-matching.mjs'

const HOUR = 3_600_000
export const EVENT_MATCH_TOLERANCE_HOURS = 6
const DEFAULT_TIME = '22:00'

export function appEventStartMs(event) {
  const time = /^\d{1,2}:\d{2}$/.test(String(event?.eventTime ?? event?.time ?? '')) ? String(event.eventTime ?? event.time).padStart(5, '0') : DEFAULT_TIME
  return parseInstant(`${event?.date}T${time}:00`)
}

// Liga um evento da Zig ao evento do app pelo horário de início (não só pelo dia): duas noites no mesmo dia
// ou uma noite que termina de manhã não se misturam. Empate ou ausência de candidato = sem vínculo.
export function mapZigEventToApp(zigBeginMs, appEvents) {
  if (zigBeginMs === null || zigBeginMs === undefined) return { appEvent: null, reason: 'Evento da Zig sem horário de início.' }
  const candidates = appEvents
    .map((appEvent) => ({ appEvent, distance: Math.abs((appEventStartMs(appEvent) ?? Infinity) - zigBeginMs) }))
    .filter((item) => item.distance <= EVENT_MATCH_TOLERANCE_HOURS * HOUR)
    .sort((a, b) => a.distance - b.distance)
  if (!candidates.length) return { appEvent: null, reason: 'nenhum evento do app com horário de início próximo' }
  if (candidates.length > 1 && candidates[1].distance === candidates[0].distance) return { appEvent: null, reason: 'mais de um evento do app com o mesmo horário de início' }
  return { appEvent: candidates[0].appEvent, reason: '' }
}
