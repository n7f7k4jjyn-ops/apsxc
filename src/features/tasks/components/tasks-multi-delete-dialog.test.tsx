import { useState } from 'react'
import { createTableMock } from '@/test-utils/tanstack-table'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { TasksMultiDeleteDialog } from './tasks-multi-delete-dialog'

vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig()),
  sleep: vi.fn(() => Promise.resolve()),
}))

describe('TasksMultiDeleteDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the dialog with the correct title, description, input and buttons', async () => {
    const { table } = createTableMock()

    const { getByRole, getByText } = await render(
      <TasksMultiDeleteDialog open onOpenChange={vi.fn()} table={table} onDelete={vi.fn().mockResolvedValue(undefined)} />
    )

    const title = getByRole('heading', {
      level: 2,
      name: /Excluir 2 tarefas/i,
    })
    const desc = getByText(
      'Tem certeza de que deseja excluir as tarefas selecionadas?'
    )
    const confirmDeleteInput = getByRole('textbox', {
      name: /Digite "EXCLUIR" para confirmar/i,
    })
    const cancelButton = getByRole('button', { name: /Cancelar/i })
    const deleteButton = getByRole('button', { name: /Excluir/i })

    await expect.element(title).toBeInTheDocument()
    await expect.element(desc).toBeInTheDocument()
    await expect.element(confirmDeleteInput).toBeInTheDocument()
    await expect.element(cancelButton).toBeInTheDocument()
    await expect.element(deleteButton).toBeInTheDocument()
    await expect.element(deleteButton).toBeDisabled()
  })

  it('keeps the delete button disabled until the confirm delete input is filled correctly', async () => {
    const { table } = createTableMock()
    const { getByRole } = await render(
      <TasksMultiDeleteDialog open onOpenChange={vi.fn()} table={table} onDelete={vi.fn().mockResolvedValue(undefined)} />
    )

    const confirmDeleteInput = getByRole('textbox', {
      name: /Digite "EXCLUIR" para confirmar/i,
    })
    const deleteButton = getByRole('button', { name: /Excluir/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(confirmDeleteInput, 'wrong-input')
    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(confirmDeleteInput, 'EXCLUIR')
    await expect.element(deleteButton).toBeEnabled()
  })

  it('closes the dialog when the cancel button is clicked', async () => {
    const onOpenChange = vi.fn()
    const { table } = createTableMock()
    const { getByRole } = await render(
      <TasksMultiDeleteDialog open onOpenChange={onOpenChange} table={table} onDelete={vi.fn().mockResolvedValue(undefined)} />
    )

    const cancelButton = getByRole('button', { name: /Cancelar/i })
    await userEvent.click(cancelButton)

    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('resets the confirm delete input when the dialog is closed and reopened', async () => {
    const { table } = createTableMock()

    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type='button' onClick={() => setOpen(true)}>
            Reopen
          </button>
          {open ? (
            <TasksMultiDeleteDialog
              open={open}
              onOpenChange={setOpen}
              table={table}
              onDelete={vi.fn().mockResolvedValue(undefined)}
            />
          ) : null}
        </>
      )
    }

    const { getByRole } = await render(<Harness />)

    const confirmDeleteInput = getByRole('textbox', {
      name: /Digite "EXCLUIR" para confirmar/i,
    })
    await userEvent.fill(confirmDeleteInput, 'EXCLUIR')
    await expect.element(confirmDeleteInput).toHaveValue('EXCLUIR')

    const cancelButton = getByRole('button', { name: /Cancelar/i })
    await userEvent.click(cancelButton)

    const reopenButton = getByRole('button', { name: /Reopen/i })
    await userEvent.click(reopenButton)
    await expect.element(confirmDeleteInput).toHaveValue('')
  })

  it('shows the submitted data when deleted successfully', async () => {
    const { table, resetRowSelection } = createTableMock()
    const onOpenChange = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const { getByRole } = await render(
      <TasksMultiDeleteDialog open onOpenChange={onOpenChange} table={table} onDelete={onDelete} />
    )

    const confirmDeleteInput = getByRole('textbox', {
      name: /Digite "EXCLUIR" para confirmar/i,
    })
    const deleteButton = getByRole('button', { name: /Excluir/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(confirmDeleteInput, 'EXCLUIR')
    await expect.element(deleteButton).toBeEnabled()

    await userEvent.click(deleteButton)

    await vi.waitFor(() => {
      expect(onDelete).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(resetRowSelection).toHaveBeenCalledOnce()
    })
  })

  it('deletes successfully when press Enter key on the confirm delete input', async () => {
    const { table, resetRowSelection } = createTableMock()
    const onOpenChange = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const { getByRole } = await render(
      <TasksMultiDeleteDialog open onOpenChange={onOpenChange} table={table} onDelete={onDelete} />
    )

    const confirmDeleteInput = getByRole('textbox', {
      name: /Digite "EXCLUIR" para confirmar/i,
    })
    const deleteButton = getByRole('button', { name: /Excluir/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(confirmDeleteInput, 'EXCLUIR')
    await expect.element(deleteButton).toBeEnabled()

    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => {
      expect(onDelete).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(resetRowSelection).toHaveBeenCalledOnce()
    })
  })
})
