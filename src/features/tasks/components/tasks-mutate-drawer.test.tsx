import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type Task } from '../data/schema'
import { TasksMutateDrawer } from './tasks-mutate-drawer'

const { saveTaskMock } = vi.hoisted(() => ({ saveTaskMock: vi.fn() }))
vi.mock('./tasks-provider', () => ({ useTasks: () => ({ team: [{ username: 'equipe1', displayName: 'Pessoa da equipe' }], saveTask: saveTaskMock }) }))

const MOCK_TASK = { id: 'task-1', title: 'Revisar evento', description: '', status: 'in progress', label: 'feature', priority: 'medium', assignee: '', assigneeName: '', dueDate: '' } satisfies Task

describe('TasksMutateDrawer', () => {
  beforeEach(() => { vi.clearAllMocks(); saveTaskMock.mockResolvedValue(undefined) })

  it('salva a tarefa com responsável e prazo atribuídos', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(<TasksMutateDrawer open onOpenChange={onOpenChange} />)
    await userEvent.fill(getByRole('textbox', { name: 'Título' }), 'Preparar lista do sábado')
    await userEvent.selectOptions(getByRole('combobox', { name: 'Responsável' }), 'equipe1')
    await userEvent.fill(getByRole('textbox', { name: 'Prazo' }), '2026-10-10')
    await userEvent.click(getByRole('button', { name: 'Salvar tarefa' }))

    await vi.waitFor(() => expect(saveTaskMock).toHaveBeenCalledWith({
      title: 'Preparar lista do sábado', description: '', status: 'todo', label: 'feature',
      priority: 'medium', assignee: 'equipe1', dueDate: '2026-10-10',
    }, undefined))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('atualiza uma tarefa existente mantendo o mesmo identificador', async () => {
    const { getByRole } = await render(<TasksMutateDrawer open onOpenChange={vi.fn()} currentRow={MOCK_TASK} />)
    await userEvent.fill(getByRole('textbox', { name: 'Descrição' }), 'Confirmar os nomes antes da festa')
    await userEvent.click(getByRole('button', { name: 'Salvar tarefa' }))
    await vi.waitFor(() => expect(saveTaskMock).toHaveBeenCalledWith(expect.objectContaining({ description: 'Confirmar os nomes antes da festa' }), 'task-1'))
  })
})
