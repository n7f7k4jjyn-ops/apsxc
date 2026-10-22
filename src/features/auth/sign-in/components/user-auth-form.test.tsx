import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { type Locator, userEvent } from 'vitest/browser'
import { UserAuthForm } from './user-auth-form'

const navigate = vi.fn()
const setUserMock = vi.fn()

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ auth: { setUser: setUserMock } }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

describe('UserAuthForm', () => {
  let screen: RenderResult
  let emailInput: Locator
  let passwordInput: Locator
  let signInButton: Locator
  const user = { accountNo: 'verdant-team', email: 'equipe@verdant.test', role: ['admin'], exp: Date.now() + 60_000 }

  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.removeItem('verdant_remembered_username')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user }) }))
    screen = await render(<UserAuthForm />)
    emailInput = screen.getByRole('textbox', { name: /e-mail/i })
    passwordInput = screen.getByLabelText(/^Senha$/i)
    signInButton = screen.getByRole('button', { name: /^Entrar$/i })
  })

  afterEach(() => {
    localStorage.removeItem('verdant_remembered_username')
    vi.unstubAllGlobals()
  })

  it('requires a longer password before contacting the server', async () => {
    await userEvent.fill(emailInput, 'equipe@verdant.test')
    await userEvent.fill(passwordInput, 'curta123')
    await userEvent.click(signInButton)
    await expect.element(screen.getByText('A senha precisa ter pelo menos 12 caracteres.')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('creates a server session and opens the dashboard after valid login', async () => {
    await userEvent.fill(emailInput, 'equipe@verdant.test')
    await userEvent.fill(passwordInput, 'UmaSenhaForte2026!')
    await userEvent.click(signInButton)

    await vi.waitFor(() => expect(setUserMock).toHaveBeenCalledWith(user))
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'same-origin',
    }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true }))
  })

  it('uses a username on the Verdant login screen while keeping the same server session flow', async () => {
    await screen.rerender(<UserAuthForm appearance='verdant' />)
    const usernameInput = screen.getByRole('textbox', { name: /nome de usuário/i })
    await userEvent.fill(usernameInput, 'bruno')
    await userEvent.fill(passwordInput, 'UmaSenhaForte2026!')
    await userEvent.click(signInButton)

    await vi.waitFor(() => expect(setUserMock).toHaveBeenCalledWith(user))
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ username: 'bruno', password: 'UmaSenhaForte2026!', rememberMe: false }),
    }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true }))
  })

  it('remembers the username and requests a persistent session when selected', async () => {
    await screen.rerender(<UserAuthForm appearance='verdant' />)
    const usernameInput = screen.getByRole('textbox', { name: /nome de usuário/i })
    const rememberCheckbox = screen.getByRole('checkbox', { name: /lembrar usuário e manter conectado por 30 dias/i })
    await userEvent.fill(usernameInput, 'bruno')
    await userEvent.fill(passwordInput, 'UmaSenhaForte2026!')
    await userEvent.click(rememberCheckbox)
    await userEvent.click(signInButton)

    await vi.waitFor(() => expect(setUserMock).toHaveBeenCalledWith(user))
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      body: JSON.stringify({ username: 'bruno', password: 'UmaSenhaForte2026!', rememberMe: true }),
    }))
    expect(localStorage.getItem('verdant_remembered_username')).toBe('bruno')
  })

  it('shows the server rejection without saving a client-side token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'E-mail ou senha inválidos.' }) } as Response)
    await userEvent.fill(emailInput, 'equipe@verdant.test')
    await userEvent.fill(passwordInput, 'UmaSenhaForte2026!')
    await userEvent.click(signInButton)

    await expect.element(screen.getByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.')
    expect(setUserMock).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
