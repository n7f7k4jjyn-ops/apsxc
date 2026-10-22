import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { Trash2, CircleArrowUp, ArrowUpDown, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { priorities, statuses } from '../data/data'
import { type Task } from '../data/schema'
import { TasksMultiDeleteDialog } from './tasks-multi-delete-dialog'
import { useTasks } from './tasks-provider'

type DataTableBulkActionsProps<TData> = {
  table: Table<TData>
}

export function DataTableBulkActions<TData>({
  table,
}: DataTableBulkActionsProps<TData>) {
  const { language, translate } = useLanguage()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { saveTask, deleteTask } = useTasks()
  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleBulkStatusChange = (status: string) => {
    const selectedTasks = selectedRows.map((row) => row.original as Task)
    toast.promise(Promise.all(selectedTasks.map(({ id, ...task }) => saveTask({ title: task.title, description: task.description || '', status, label: task.label, priority: task.priority, assignee: task.assignee || '', dueDate: task.dueDate || '' }, id, true))), {
      loading: translate('Atualizando status...'),
      success: () => {
        table.resetRowSelection()
        const statusLabel = statuses.find((item) => item.value === status)?.label ?? status
        return language === 'en'
          ? `Status updated to "${translate(statusLabel)}" for ${selectedTasks.length} ${selectedTasks.length === 1 ? 'task' : 'tasks'}.`
          : `Status atualizado para "${statusLabel}" em ${selectedTasks.length} ${selectedTasks.length > 1 ? 'tarefas' : 'tarefa'}.`
      },
      error: translate('Falha ao atualizar tarefas.'),
    })
  }

  const handleBulkPriorityChange = (priority: string) => {
    const selectedTasks = selectedRows.map((row) => row.original as Task)
    toast.promise(Promise.all(selectedTasks.map(({ id, ...task }) => saveTask({ title: task.title, description: task.description || '', status: task.status, label: task.label, priority, assignee: task.assignee || '', dueDate: task.dueDate || '' }, id, true))), {
      loading: translate('Atualizando prioridade...'),
      success: () => {
        table.resetRowSelection()
        const priorityLabel = priorities.find((item) => item.value === priority)?.label ?? priority
        return language === 'en'
          ? `Priority updated to "${translate(priorityLabel)}" for ${selectedTasks.length} ${selectedTasks.length === 1 ? 'task' : 'tasks'}.`
          : `Prioridade atualizada para "${priorityLabel}" em ${selectedTasks.length} ${selectedTasks.length > 1 ? 'tarefas' : 'tarefa'}.`
      },
      error: translate('Falha ao atualizar tarefas.'),
    })
  }

  const handleBulkExport = () => {
    const selectedTasks = selectedRows.map((row) => row.original as Task)
    const csv = [[...['ID', 'Título', 'Descrição', 'Responsável', 'Prazo', 'Status', 'Categoria', 'Prioridade'].map(translate)], ...selectedTasks.map((task) => [task.id, task.title, task.description, task.assigneeName || task.assignee, task.dueDate, task.status, task.label, task.priority])].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
    link.download = language === 'en' ? 'verdant-tasks.csv' : 'tarefas-verdant.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    toast.success(language === 'en'
      ? `${selectedTasks.length} ${selectedTasks.length === 1 ? 'task exported' : 'tasks exported'} to CSV.`
      : `${selectedTasks.length} ${selectedTasks.length > 1 ? 'tarefas exportadas' : 'tarefa exportada'} para CSV.`)
    table.resetRowSelection()
  }

  return (
    <>
      <BulkActionsToolbar table={table} entityName={translate('tarefa')}>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='outline'
                  size='icon'
                  className='size-8'
                  aria-label={translate('Atualizar status')}
                  title={translate('Atualizar status')}
                >
                  <CircleArrowUp />
                  <span className='sr-only'><LocalizedText text='Atualizar status' /></span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p><LocalizedText text='Atualizar status' /></p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent sideOffset={14}>
            {statuses.map((status) => (
              <DropdownMenuItem
                key={status.value}
                defaultValue={status.value}
                onClick={() => handleBulkStatusChange(status.value)}
              >
                {status.icon && (
                  <status.icon className='size-4 text-muted-foreground' />
                )}
                <LocalizedText text={status.label} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='outline'
                  size='icon'
                  className='size-8'
                  aria-label={translate('Atualizar prioridade')}
                  title={translate('Atualizar prioridade')}
                >
                  <ArrowUpDown />
                  <span className='sr-only'><LocalizedText text='Atualizar prioridade' /></span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p><LocalizedText text='Atualizar prioridade' /></p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent sideOffset={14}>
            {priorities.map((priority) => (
              <DropdownMenuItem
                key={priority.value}
                defaultValue={priority.value}
                onClick={() => handleBulkPriorityChange(priority.value)}
              >
                {priority.icon && (
                  <priority.icon className='size-4 text-muted-foreground' />
                )}
                <LocalizedText text={priority.label} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              size='icon'
              onClick={() => handleBulkExport()}
              className='size-8'
              aria-label={translate('Exportar tarefas')}
              title={translate('Exportar tarefas')}
            >
              <Download />
              <span className='sr-only'><LocalizedText text='Exportar tarefas' /></span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p><LocalizedText text='Exportar tarefas' /></p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='destructive'
              size='icon'
              onClick={() => setShowDeleteConfirm(true)}
              className='size-8'
              aria-label={translate('Excluir tarefas selecionadas')}
              title={translate('Excluir tarefas selecionadas')}
            >
              <Trash2 />
              <span className='sr-only'><LocalizedText text='Excluir tarefas selecionadas' /></span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p><LocalizedText text='Excluir tarefas selecionadas' /></p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      <TasksMultiDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        table={table}
        onDelete={async (ids) => { await Promise.all(ids.map(deleteTask)); table.resetRowSelection() }}
      />
    </>
  )
}

