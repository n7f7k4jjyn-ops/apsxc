import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }))

function MobileNavigation() {
  return (
    <SidebarProvider>
      <SidebarTrigger />
      <Sidebar>
        <SidebarContent>
          <nav aria-label='Operação'>
            <a href='#agenda' aria-current='page'>
              Agenda
            </a>
            <a href='#listas'>Listas</a>
          </nav>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  )
}

describe('mobile navigation drawer', () => {
  it('focuses the active link and dismisses with Escape', async () => {
    const screen = await render(<MobileNavigation />)
    const trigger = screen.getByRole('button', {
      name: 'Alternar menu lateral',
    })
    await userEvent.click(trigger)
    await expect
      .element(screen.getByRole('dialog', { name: 'Menu lateral' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'Agenda' }))
      .toHaveFocus()
    const preventEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault()
    }
    document.addEventListener('keydown', preventEscape, true)
    try {
      await userEvent.keyboard('{Escape}')
    } finally {
      document.removeEventListener('keydown', preventEscape, true)
    }
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect.element(trigger).toHaveFocus()
  })

  it('offers a named close button', async () => {
    const screen = await render(<MobileNavigation />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Alternar menu lateral' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar', exact: true })
    )
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
  })
})
