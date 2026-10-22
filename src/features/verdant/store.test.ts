import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const remote = {
  version: 4,
  revision: 0,
  updatedAt: '',
  events: [{ id: 'real-event' }],
  forms: [],
  people: [],
  registrations: [],
}
const response = () =>
  new Response(JSON.stringify(remote), {
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('window', { setInterval, clearInterval })
  vi.stubGlobal('document', { hidden: false })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('sincronização do painel', () => {
  it('recupera os dados após falha inicial mesmo com revisão zero no servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementation(async () => response())
    )
    const { useVerdantStore } = await import('./store')
    await useVerdantStore.getState().initialize()
    expect(useVerdantStore.getState().serverConnected).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(useVerdantStore.getState().serverConnected).toBe(true)
    expect(useVerdantStore.getState().data.events[0].id).toBe('real-event')
  })
  it('preserva os dados numa falha de atualização e pausa a consulta em abas ocultas', async () => {
    const fetcher = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetcher)
    const { useVerdantStore } = await import('./store')
    await useVerdantStore.getState().initialize()
    vi.stubGlobal('document', { hidden: true })
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockRejectedValueOnce(new Error('offline'))
    await useVerdantStore.getState().refresh()
    expect(useVerdantStore.getState().serverConnected).toBe(false)
    expect(useVerdantStore.getState().data.events[0].id).toBe('real-event')
  })
})
