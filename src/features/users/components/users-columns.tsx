import { type Column, type ColumnDef, type Row, type Table } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { LongText } from '@/components/long-text'
import { callTypes, roles } from '../data/data'
import { type User, type UserStatus } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

const statusLabels: Record<UserStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  invited: 'Convite pendente',
  suspended: 'Suspenso',
}

function UserColumnHeader<TValue>({ column, title }: { column: Column<User, TValue>; title: string }) {
  const { translate } = useLanguage()
  return <DataTableColumnHeader column={column} title={translate(title)} />
}

function SelectAllUsers({ table }: { table: Table<User> }) {
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

function SelectUser({ row }: { row: Row<User> }) {
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

export const usersColumns: ColumnDef<User>[] = [
  {
    id: 'select',
    header: ({ table }) => <SelectAllUsers table={table} />,
    meta: {
      className: cn('inset-s-0 z-10 rounded-tl-[inherit] max-md:sticky'),
    },
    cell: ({ row }) => <SelectUser row={row} />,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'username',
    header: ({ column }) => (
      <UserColumnHeader column={column} title='Usuário' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-36 ps-3'>{row.getValue('username')}</LongText>
    ),
    meta: {
      className: cn(
        'drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.1)] dark:drop-shadow-[0_1px_2px_rgb(255_255_255_/_0.1)]',
        'inset-s-6 ps-0.5 max-md:sticky @4xl/content:table-cell @4xl/content:drop-shadow-none'
      ),
    },
    enableHiding: false,
  },
  {
    id: 'fullName',
    header: ({ column }) => (
      <UserColumnHeader column={column} title='Nome completo' />
    ),
    cell: ({ row }) => {
      const { firstName, lastName } = row.original
      const fullName = `${firstName} ${lastName}`
      return <LongText className='max-w-36'>{fullName}</LongText>
    },
    meta: { className: 'w-36' },
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <UserColumnHeader column={column} title='E-mail' />
    ),
    cell: ({ row }) => (
      <div className='w-fit ps-2 text-nowrap'>{row.getValue('email')}</div>
    ),
  },
  {
    accessorKey: 'phoneNumber',
    header: ({ column }) => (
      <UserColumnHeader column={column} title='Telefone' />
    ),
    cell: ({ row }) => <div>{row.getValue('phoneNumber')}</div>,
    enableSorting: false,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <UserColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const { status } = row.original
      const badgeColor = callTypes.get(status)
      return (
        <div className='flex space-x-2'>
          <Badge variant='outline' className={cn('capitalize', badgeColor)}>
            <LocalizedText text={statusLabels[status]} />
          </Badge>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
    enableHiding: false,
    enableSorting: false,
  },
  {
    accessorKey: 'role',
    header: ({ column }) => (
      <UserColumnHeader column={column} title='Permissão' />
    ),
    cell: ({ row }) => {
      const { role } = row.original
      const userType = roles.find(({ value }) => value === role)

      if (!userType) {
        return null
      }

      return (
        <div className='flex items-center gap-x-2'>
          {userType.icon && (
            <userType.icon size={16} className='text-muted-foreground' />
          )}
          <span className='text-sm'><LocalizedText text={userType.label} /></span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'actions',
    cell: DataTableRowActions,
  },
]

