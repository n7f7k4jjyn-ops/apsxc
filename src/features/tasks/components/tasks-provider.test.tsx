import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { TasksProvider, useTasks } from './tasks-provider'

function TaskState() {
  const { loading, error, reload, tasks } = useTasks()
  return (
    <>
      <p role='status'>
        {loading ? 'Carregando' : error || `${tasks.length} tarefas`}
      </p>
      <button onClick={() => void reload()}>Tentar novamente</button>
    </>
  )
}

describe('task loading recovery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('retains an inline error and can retry loading', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const screen = await render(
      <TasksProvider>
        <TaskState />
      </TasksProvider>
    )
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Não foi possível carregar tarefas e equipe.')
    fetchMock.mockImplementation(async (url: string) =>
      Response.json(url === '/api/tasks' ? { tasks: [] } : { users: [] })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Tentar novamente' })
    )
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('0 tarefas')
  })
})
