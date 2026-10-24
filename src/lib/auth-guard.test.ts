import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireSession } from './auth-guard'

const reset = vi.fn()
const setUser = vi.fn()
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ auth: { reset, setUser } }) },
}))

describe('private route session guard', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('preserves the full destination when the session expires', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    )
    await expect(
      requireSession('/verdant/inscricoes?event=example#lista')
    ).rejects.toMatchObject({
      options: {
        to: '/sign-in',
        search: { redirect: '/verdant/inscricoes?event=example#lista' },
      },
    })
    expect(reset).toHaveBeenCalledOnce()
    expect(setUser).not.toHaveBeenCalled()
  })

  it('does not log the user out when the service is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    )
    await expect(requireSession('/tasks')).rejects.toThrow(
      'Não foi possível verificar sua sessão.'
    )
    expect(reset).not.toHaveBeenCalled()
    expect(setUser).not.toHaveBeenCalled()
  })

  it('restores the server-authenticated user before showing a private page', async () => {
    const user = {
      accountNo: 'team',
      email: 'team@example.test',
      role: ['operator'],
      exp: 1234,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ user })))
    await requireSession('/tasks')
    expect(setUser).toHaveBeenCalledWith(user)
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({
        credentials: 'same-origin',
        signal: expect.any(AbortSignal),
      })
    )
  })
})
