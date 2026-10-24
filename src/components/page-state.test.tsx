import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { PageDataState } from './page-state'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string }) => string
  }) => select({ pathname: '/verdant/agenda' }),
}))

describe('shared page data states', () => {
  it('keeps unsaved input mounted while the connection is lost and restored', async () => {
    const retry = vi.fn()
    const page = (connected: boolean) => (
      <PageDataState ready connected={connected} retry={retry}>
        <input aria-label='Nome do evento' defaultValue='' />
      </PageDataState>
    )
    const screen = await render(page(true))
    const input = screen.getByRole('textbox', { name: 'Nome do evento' })
    await userEvent.fill(input, 'Rascunho não salvo')
    await screen.rerender(page(false))
    await expect.element(screen.getByRole('alert')).toBeVisible()
    await expect.element(input).toHaveValue('Rascunho não salvo')
    await userEvent.click(
      screen.getByRole('button', { name: 'Tentar novamente' })
    )
    expect(retry).toHaveBeenCalledOnce()
    await screen.rerender(page(true))
    await expect.element(input).toHaveValue('Rascunho não salvo')
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
  })

  it('announces loading with placeholders before data is ready', async () => {
    const screen = await render(
      <PageDataState ready={false} connected={false} retry={vi.fn()}>
        <p>Dados</p>
      </PageDataState>
    )
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Carregando página…')
    await expect
      .element(screen.getByText('Dados', { exact: true }))
      .not.toBeInTheDocument()
  })
})
