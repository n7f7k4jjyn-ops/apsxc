import { type Column, type ColumnDef, type Row, type Table } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { labels, priorities, statuses } from '../data/data'
import { type Task } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

function TaskColumnHeader<TValue>({ column, title }: { column: Column<Task, TValue>; title: string }) {
  const { translate } = useLanguage()
  return <DataTableColumnHeader column={column} title={translate(title)} />
}

function SelectAllTasks({ table }: { table: Table<Task> }) {
  const { translate } = useLanguage()
  return (
    <Checkbox
      checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      aria-label={translate('Selecionar todos')}
      className='translate-y-0.5'
    />
  )
}

function SelectTask({ row }: { row: Row<Task> }) {
  const { translate } = useLanguage()
  return (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
      aria-label={translate('Selecionar linha')}
      className='translate-y-0.5'
    />
  )
}

function TaskDueDate({ value }: { value?: string }) {
  const { language } = useLanguage()
  if (!value) return <span className='text-muted-foreground'>—</span>
  return <>{new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))}</>
}

export const tasksColumns: ColumnDef<Task>[] = [
  {
    id: 'select',
    header: ({ table }) => <SelectAllTasks table={table} />,
    cell: ({ row }) => <SelectTask row={row} />,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <TaskColumnHeader column={column} title='Tarefa' />
    ),
    meta: { className: 'w-32 max-w-32', tdClassName: 'overflow-hidden' },
    cell: ({ row }) => <div className='w-32 max-w-full truncate font-mono text-xs' title={row.original.id}>{row.original.id}</div>,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <TaskColumnHeader column={column} title='Título' />
    ),
    meta: {
      className: 'w-[32%] max-w-0 ps-1',
      tdClassName: 'min-w-0 overflow-hidden ps-4',
    },
    cell: ({ row }) => {
      const label = labels.find((label) => label.value === row.original.label)

      return (
        <div className='flex min-w-0 items-center gap-2'>
          {label && <Badge className='shrink-0' variant='outline'><LocalizedText text={label.label} /></Badge>}
          <span className='min-w-0 truncate font-medium' title={row.original.title}>{row.original.title}</span>
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <TaskColumnHeader column={column} title='Status' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-4' },
    cell: ({ row }) => {
      const status = statuses.find(
        (status) => status.value === row.getValue('status')
      )

      if (!status) {
        return null
      }

      return (
        <div className='flex w-25 items-center gap-2'>
          {status.icon && (
            <status.icon className='size-4 text-muted-foreground' />
          )}
          <span><LocalizedText text={status.label} /></span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'assignee',
    header: ({ column }) => <TaskColumnHeader column={column} title='Responsável' />,
    cell: ({ row }) => <span className='text-sm'>{row.original.assigneeName || row.original.assignee || <LocalizedText text='Não atribuído' />}</span>,
  },
  {
    accessorKey: 'dueDate',
    header: ({ column }) => <TaskColumnHeader column={column} title='Prazo' />,
    cell: ({ row }) => <TaskDueDate value={row.original.dueDate} />,
  },
  {
    accessorKey: 'priority',
    header: ({ column }) => (
      <TaskColumnHeader column={column} title='Prioridade' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-3' },
    cell: ({ row }) => {
      const priority = priorities.find(
        (priority) => priority.value === row.getValue('priority')
      )

      if (!priority) {
        return null
      }

      return (
        <div className='flex items-center gap-2'>
          {priority.icon && (
            <priority.icon className='size-4 text-muted-foreground' />
          )}
          <span><LocalizedText text={priority.label} /></span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
]


