import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pixelId = '4208900759401820'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('window', { location: { pathname: '/lovers' }, fbq: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('medição dos formulários públicos', () => {
  it('inicializa uma vez e registra visitas ao trocar de formulário sem duplicar a montagem', async () => {
    const { startMetaPixel } = await import('./meta-pixel')
    startMetaPixel(pixelId)
    startMetaPixel(pixelId)
    window.location.pathname = '/equipe'
    startMetaPixel(pixelId)
    expect(window.fbq).toHaveBeenCalledTimes(3)
    expect(window.fbq).toHaveBeenNthCalledWith(1, 'init', pixelId)
    expect(window.fbq).toHaveBeenNthCalledWith(2, 'track', 'PageView')
    expect(window.fbq).toHaveBeenNthCalledWith(3, 'track', 'PageView')
  })

  it('separa candidaturas das atualizações internas sem incluir dados preenchidos', async () => {
    const { startMetaPixel, trackPixelEvent, trackTeamUpdate } =
      await import('./meta-pixel')
    startMetaPixel(pixelId)
    trackPixelEvent('Lead', { content_name: 'trabalhe-conosco' })
    trackTeamUpdate()
    expect(window.fbq).toHaveBeenNthCalledWith(3, 'track', 'Lead', {
      content_name: 'trabalhe-conosco',
    })
    expect(window.fbq).toHaveBeenNthCalledWith(
      4,
      'trackCustom',
      'TeamRegistrationUpdated'
    )
  })

  it('ignora IDs inválidos, eventos antes da inicialização e falhas no rastreador', async () => {
    const { startMetaPixel, trackPixelEvent, trackTeamUpdate } =
      await import('./meta-pixel')
    startMetaPixel('inválido')
    trackPixelEvent('Lead')
    trackTeamUpdate()
    expect(window.fbq).not.toHaveBeenCalled()
    startMetaPixel(pixelId)
    window.fbq = vi.fn(() => {
      throw new Error('bloqueado')
    }) as unknown as NonNullable<Window['fbq']>
    expect(() => trackPixelEvent('Lead')).not.toThrow()
    expect(() => trackTeamUpdate()).not.toThrow()
  })
})
