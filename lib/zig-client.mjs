export const ZIG_BASE_URL = 'https://api.zigcore.com.br/integration'
export const CHECKIN_PAGE_SIZE = 50
export const CHECKIN_MAX_WINDOW_DAYS = 5
export const CHECKIN_MAX_PAGES = 200
export const MAX_EVENTS_PER_QUERY = 5
const REQUEST_TIMEOUT_MS = 20_000
const DAY_MS = 86_400_000

export class ZigError extends Error {
  constructor(message, { code = 'zig_error', zigStatus = null, status = 502 } = {}) {
    super(message)
    this.name = 'ZigError'
    this.code = code
    this.zigStatus = zigStatus
    this.status = status
  }
}

export function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null
  return time
}

export function formatDay(time) {
  return new Date(time).toISOString().slice(0, 10)
}

export function addDays(value, days) {
  return formatDay(parseDay(value) + days * DAY_MS)
}

export function validateToken(token) {
  if (typeof token !== 'string' || !token.trim()) return false
  return token.length <= 2048 && !/[\u0000-\u001f\u007f\s]/.test(token.trim())
}

// Mensagens de erro são sempre locais: o corpo devolvido pela Zig nunca é lido nem repassado, pois pode ecoar o token (inclusive truncado).
async function errorFromResponse(response) {
  const zigStatus = response.status
  try { await response.body?.cancel() } catch { /* Corpo descartado. */ }
  if (zigStatus === 401 || zigStatus === 403) return new ZigError('A Zig recusou o token de integração. Confira se o token está correto e ativo.', { code: 'zig_auth', zigStatus })
  if (zigStatus === 400 || zigStatus === 422) return new ZigError('A Zig recusou os parâmetros da consulta. Confira a rede, a loja e o período.', { code: 'zig_rejected', zigStatus })
  if (zigStatus === 404) return new ZigError('A Zig não encontrou o recurso consultado. Confira a rede e a loja configuradas.', { code: 'zig_not_found', zigStatus })
  if (zigStatus === 429) return new ZigError('A Zig limitou as consultas (muitas requisições). Aguarde alguns minutos e tente novamente.', { code: 'zig_rate_limited', zigStatus })
  if (zigStatus >= 500) return new ZigError('A API da Zig está indisponível no momento. Tente novamente mais tarde.', { code: 'zig_unavailable', zigStatus })
  return new ZigError(`A Zig respondeu com status ${zigStatus}.`, { code: 'zig_error', zigStatus })
}

// O cliente só fala com ZIG_BASE_URL e só emite GET; o token nunca é incluído em mensagens de erro.
export function createZigClient({ token, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS, baseUrl = ZIG_BASE_URL } = {}) {
  if (!validateToken(token)) throw new ZigError('O token de integração da Zig não está configurado.', { code: 'zig_token_missing', status: 409 })
  const authorization = token.trim()

  async function get(route, params) {
    const url = new URL(`${baseUrl}${route}`)
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value))
    let response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: authorization, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (cause) {
      const timeout = cause?.name === 'TimeoutError' || cause?.name === 'AbortError'
      throw new ZigError(timeout ? 'A Zig não respondeu a tempo. Tente novamente.' : 'Não foi possível conectar à API da Zig.', { code: timeout ? 'zig_timeout' : 'zig_network' })
    }
    if (!response.ok) throw await errorFromResponse(response)
    let body
    try {
      body = await response.json()
    } catch {
      throw new ZigError('A Zig devolveu uma resposta que não é JSON válido.', { code: 'zig_invalid_response' })
    }
    if (!Array.isArray(body)) throw new ZigError('A Zig devolveu um formato inesperado (era esperada uma lista).', { code: 'zig_invalid_response' })
    return body
  }

  function requireDays(start, end) {
    const from = parseDay(start)
    const to = parseDay(end)
    if (from === null || to === null) throw new ZigError('As datas devem estar no formato AAAA-MM-DD.', { code: 'invalid_period', status: 400 })
    if (to < from) throw new ZigError('A data final não pode ser anterior à inicial.', { code: 'invalid_period', status: 400 })
    return { from, to }
  }

  return {
    listStores: (rede) => get('/erp/lojas', { rede }),
    listEvents(loja, dtinicio, dtfim) {
      requireDays(dtinicio, dtfim)
      return get('/erp/events', { loja, dtinicio, dtfim })
    },
    listBuyers(loja, dtinicio, dtfim) {
      requireDays(dtinicio, dtfim)
      return get('/erp/compradores', { loja, dtinicio, dtfim })
    },
    async listCheckins(loja, desde, dtfim) {
      const { from, to } = requireDays(desde, dtfim)
      if ((to - from) / DAY_MS > CHECKIN_MAX_WINDOW_DAYS) {
        throw new ZigError(`A Zig aceita no máximo ${CHECKIN_MAX_WINDOW_DAYS} dias por consulta de check-ins.`, { code: 'invalid_period', status: 400 })
      }
      const items = []
      let previous = ''
      for (let page = 1; page <= CHECKIN_MAX_PAGES; page++) {
        let rows
        try {
          rows = await get('/erp/checkins', { loja, desde, dtfim, page })
        } catch (error) {
          if (error instanceof ZigError) error.message = `${error.message} (check-ins, página ${page}; resultado incompleto descartado)`
          throw error
        }
        const signature = rows.length ? JSON.stringify([rows[0], rows[rows.length - 1], rows.length]) : ''
        if (signature && signature === previous) {
          throw new ZigError(`A Zig repetiu o conteúdo da página ${page} de check-ins; a paginação não é confiável e o resultado foi descartado.`, { code: 'zig_pagination', status: 502 })
        }
        previous = signature
        items.push(...rows)
        if (rows.length < CHECKIN_PAGE_SIZE) return { items, pages: page }
      }
      throw new ZigError(`Os check-ins excederam ${CHECKIN_MAX_PAGES} páginas; reduza o período. Resultado incompleto descartado.`, { code: 'zig_pagination', status: 422 })
    },
  }
}
