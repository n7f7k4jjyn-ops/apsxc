import '@/styles/index.css'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { AppQuickNav } from './app-quick-nav'
import { PageContext } from './page-context'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string }) => string
  }) => select({ pathname: '/verdant/djs' }),
  Link: ({
    to,
    children,
    ...props
  }: React.ComponentProps<'a'> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (
    select: (state: { auth: { user: { role: string[] } } }) => unknown
  ) => select({ auth: { user: { role: ['viewer'] } } }),
}))

describe('page navigation context', () => {
  beforeEach(async () => {
    navigate.mockClear()
    await page.viewport(1280, 720)
  })

  it('shows the current title and parent breadcrumbs with click analytics', async () => {
    const listener = vi.fn()
    window.addEventListener('verdant:analytics', listener)
    const screen = await render(<PageContext />)
    try {
      await expect.element(screen.getByText('DJs').first()).toBeVisible()
      const parent = screen.getByRole('link', { name: 'Cadastros' })
      // Prevent the native test link from leaving the browser test page.
      const element = parent.element()
      element.addEventListener('click', (event) => event.preventDefault())
      await userEvent.click(parent)
      expect(listener.mock.calls[0][0].detail).toEqual({
        event: 'breadcrumb_click',
        path: '/verdant/djs',
        destination: '/verdant/cadastros',
      })
      await expect
        .element(screen.getByRole('navigation'))
        .toHaveAccessibleName('Localização na navegação')
    } finally {
      window.removeEventListener('verdant:analytics', listener)
    }
  })

  it('marks the current domain and hides admin-only quick links', async () => {
    const screen = await render(<AppQuickNav />)
    await expect
      .element(screen.getByRole('link', { name: 'Cadastros' }))
      .toHaveAttribute('aria-current', 'page')
    await expect
      .element(screen.getByRole('link', { name: 'Financeiro' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Resumo', exact: true }))
      .not.toHaveAttribute('aria-current')
  })

  it('offers a touch-sized mobile selector and allows returning to the parent section', async () => {
    await page.viewport(320, 700)
    try {
      const screen = await render(<AppQuickNav />)
      const select = screen.getByRole('combobox', { name: 'Ir para página' })
      await expect.element(select).toHaveValue('')
      await expect
        .element(screen.getByRole('option', { name: 'DJs', exact: true }))
        .toBeDisabled()
      expect(
        select.element().getBoundingClientRect().height
      ).toBeGreaterThanOrEqual(44)
      expect(
        select.element().getBoundingClientRect().width
      ).toBeLessThanOrEqual(320)
      await expect
        .element(screen.getByRole('option', { name: 'Financeiro' }))
        .not.toBeInTheDocument()
      await userEvent.selectOptions(select, '/verdant/cadastros')
      expect(navigate).toHaveBeenCalledWith({ to: '/verdant/cadastros' })
    } finally {
      await page.viewport(1280, 720)
    }
  })
})
