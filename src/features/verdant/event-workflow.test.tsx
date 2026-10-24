import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { EventWorkflowNav } from './event-workflow'
import { useOperationFilter } from './use-operation-filter'

const event = {
  id: 'event-1',
  name: 'Evento de teste',
  date: '2026-10-24',
  active: true,
  eventTime: '22:00',
  entryValue: '',
}

function Filters({ embedded = false }: { embedded?: boolean }) {
  const [eventId, setEventId] = useOperationFilter(
    'event',
    'default-event',
    !embedded
  )
  const [form, setForm] = useOperationFilter('form')
  return (
    <>
      <label>
        Evento
        <input value={eventId} onChange={(e) => setEventId(e.target.value)} />
      </label>
      <label>
        Lista
        <input value={form} onChange={(e) => setForm(e.target.value)} />
      </label>
      <EventWorkflowNav
        event={eventId ? { ...event, id: eventId } : undefined}
      />
    </>
  )
}

async function setup(entry: string, embedded = false) {
  const root = createRootRoute({ component: Outlet })
  const routes = [
    '/verdant/listas',
    '/verdant/inscricoes',
    '/verdant/exportacoes',
  ].map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <Filters embedded={embedded} />,
    })
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [entry] }),
  })
  await router.load()
  const screen = await render(<RouterProvider router={router} />)
  return { screen, router }
}

describe('event workflow', () => {
  it('continues to registrations without losing the event or retaining unrelated filters', async () => {
    const { screen, router } = await setup(
      '/verdant/listas?event=event-1&form=DJS'
    )
    await userEvent.click(
      screen.getByRole('link', { name: 'Inscrições', exact: true })
    )
    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/verdant/inscricoes')
    expect(router.state.location.search).toEqual({ event: 'event-1' })
    await expect
      .element(screen.getByRole('textbox', { name: 'Evento' }))
      .toHaveValue('event-1')
    await expect
      .element(screen.getByRole('link', { name: 'Inscrições', exact: true }))
      .not.toBeInTheDocument()
  })

  it('updates the URL in place, preserves other parameters, and follows history', async () => {
    const { screen, router } = await setup(
      '/verdant/inscricoes?event=event-1&form=DJS&extra=keep'
    )
    const historyLength = router.history.length
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Evento' }),
      'event-2'
    )
    await expect
      .poll(() => router.state.location.search)
      .toEqual({ event: 'event-2', form: 'DJS', extra: 'keep' })
    expect(router.history.length).toBe(historyLength)
    await router.navigate({
      to: '/verdant/inscricoes',
      search: { event: 'event-3', form: 'VIP' },
    })
    await expect
      .element(screen.getByRole('textbox', { name: 'Lista' }))
      .toHaveValue('VIP')
    router.history.back()
    await expect
      .element(screen.getByRole('textbox', { name: 'Evento' }))
      .toHaveValue('event-2')
    await expect
      .element(screen.getByRole('textbox', { name: 'Lista' }))
      .toHaveValue('DJS')
  })

  it('keeps an explicitly cleared event empty instead of restoring the report default', async () => {
    const { screen, router } = await setup('/verdant/exportacoes?event=event-1')
    await userEvent.clear(screen.getByRole('textbox', { name: 'Evento' }))
    await expect.poll(() => router.state.location.search).toEqual({ event: '' })
    await expect
      .element(screen.getByRole('textbox', { name: 'Evento' }))
      .toHaveValue('')
    await expect.element(screen.getByRole('navigation')).not.toBeInTheDocument()
  })

  it('ignores malformed search values and unknown forms', async () => {
    const { screen } = await setup(
      '/verdant/listas?event=%7B%22id%22%3A1%7D&form=UNKNOWN'
    )
    await expect
      .element(screen.getByRole('textbox', { name: 'Evento' }))
      .toHaveValue('default-event')
    await expect
      .element(screen.getByRole('textbox', { name: 'Lista' }))
      .toHaveValue('')
  })

  it('keeps embedded report selections local', async () => {
    const { screen, router } = await setup(
      '/verdant/exportacoes?event=event-1',
      true
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Evento' }),
      'event-2'
    )
    await expect
      .element(screen.getByRole('textbox', { name: 'Evento' }))
      .toHaveValue('event-2')
    expect(router.state.location.search).toEqual({ event: 'event-1' })
  })
})
