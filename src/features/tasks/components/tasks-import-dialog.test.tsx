import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { TasksImportDialog } from './tasks-import-dialog'

const mocks = vi.hoisted(() => ({ importTasks: vi.fn(), toastError: vi.fn() }))

vi.mock('./tasks-provider', () => ({
  useTasks: () => ({ importTasks: mocks.importTasks }),
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

describe('TasksImportDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the CSV import form and current Portuguese labels', async () => {
    const { getByRole, getByText, getByLabelText } = await render(
      <TasksImportDialog open onOpenChange={vi.fn()} />
    )

    await expect
      .element(getByRole('heading', { level: 2, name: 'Importar tarefas' }))
      .toBeInTheDocument()
    await expect
      .element(getByText(/CSV com colunas: Título, Descrição/))
      .toBeInTheDocument()
    await expect.element(getByLabelText('Arquivo CSV')).toBeInTheDocument()
    await expect.element(getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    await expect.element(getByRole('button', { name: 'Importar' })).toBeInTheDocument()
  })

  it('shows the required-file validation without calling the import action', async () => {
    const onOpenChange = vi.fn()
    const { getByRole, getByText } = await render(
      <TasksImportDialog open onOpenChange={onOpenChange} />
    )

    await userEvent.click(getByRole('button', { name: 'Importar' }))

    await expect.element(getByText('Selecione um arquivo CSV.')).toBeInTheDocument()
    expect(mocks.importTasks).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('parses a CSV and imports the mapped task before closing', async () => {
    const onOpenChange = vi.fn()
    const { getByRole, getByLabelText } = await render(
      <TasksImportDialog open onOpenChange={onOpenChange} />
    )
    const csv = new File(
      ['Título,Descrição,Responsável,Prazo,Status,Categoria,Prioridade\nTarefa A,Descrição,joao,2026-10-12,Em andamento,Melhoria,Alta'],
      'tarefas.csv',
      { type: 'text/csv' }
    )

    const fileInput = getByLabelText('Arquivo CSV')
    await fileInput.upload(csv)
    await expect.element(fileInput).toHaveValue('C:\\fakepath\\tarefas.csv')
    await userEvent.click(getByRole('button', { name: 'Importar' }))

    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.importTasks).toHaveBeenCalledOnce()
    expect(mocks.importTasks).toHaveBeenCalledWith([{
      title: 'Tarefa A',
      description: 'Descrição',
      assignee: 'joao',
      dueDate: '2026-10-12',
      status: 'in progress',
      label: 'feature',
      priority: 'high',
    }])
    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes and reopens the dialog from its cancel control', async () => {
    const onOpenChange = vi.fn()

    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type='button' onClick={() => setOpen(true)}>Reabrir</button>
          <TasksImportDialog
            open={open}
            onOpenChange={(value) => {
              onOpenChange(value)
              setOpen(value)
            }}
          />
        </>
      )
    }

    const { getByRole } = await render(<Harness />)

    await userEvent.click(getByRole('button', { name: 'Cancelar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await userEvent.click(getByRole('button', { name: 'Reabrir' }))
    await userEvent.click(getByRole('button', { name: 'Cancelar' }))
    expect(onOpenChange).toHaveBeenCalledTimes(2)
  })
})
