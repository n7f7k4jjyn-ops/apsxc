type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  loaded: boolean
  version: string
  push: unknown
}

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
  }
}

let startedPixelId = ''
let lastTrackedPage = ''

export function isValidPixelId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{5,30}$/.test(value)
}

export function startMetaPixel(pixelId: string) {
  if (typeof window === 'undefined' || !isValidPixelId(pixelId)) return
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue.push(args)
    } as Fbq
    fbq.queue = []
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.push = fbq
    window.fbq = fbq
    window._fbq = fbq
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }
  if (startedPixelId !== pixelId) {
    startedPixelId = pixelId
    window.fbq?.('init', pixelId)
  }
  const page = `${pixelId}:${window.location.pathname}`
  if (lastTrackedPage !== page) {
    lastTrackedPage = page
    window.fbq?.('track', 'PageView')
  }
}

export function trackPixelEvent(name: 'Lead', params?: Record<string, string>) {
  try {
    if (startedPixelId && window.fbq) window.fbq('track', name, params)
  } catch {
    // Falhas de medição não podem interromper um cadastro salvo.
  }
}

export function trackTeamUpdate() {
  try {
    if (startedPixelId && window.fbq) {
      window.fbq('trackCustom', 'TeamRegistrationUpdated')
    }
  } catch {
    // Falhas de medição não podem interromper uma atualização salva.
  }
}

export async function loadMetaPixel() {
  try {
    const response = await fetch('/api/public/meta-pixel', {
      cache: 'no-store',
    })
    if (!response.ok) return
    const result = (await response.json()) as { pixelId?: string }
    if (isValidPixelId(result.pixelId)) startMetaPixel(result.pixelId)
  } catch {
    // O Pixel é opcional; falhas não podem afetar a inscrição.
  }
}
