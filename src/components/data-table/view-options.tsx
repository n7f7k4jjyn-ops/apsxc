import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu'
import { MixerHorizontalIcon } from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-provider'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

type DataTableViewOptionsProps<TData> = {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const { translate } = useLanguage()
  const columnLabels: Record<string, string> = {
    title: 'Título',
    status: 'Status',
    assignee: 'Responsável',
    dueDate: 'Prazo',
    priority: 'Prioridade',
    username: 'Usuário',
    fullName: 'Nome completo',
    email: 'E-mail',
    phoneNumber: 'Telefone',
    role: 'Permissão',
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='ms-auto hidden h-8 lg:flex'
        >
          <MixerHorizontalIcon className='size-4' />
          {translate('Visualizar')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-37.5'>
        <DropdownMenuLabel>{translate('Mostrar/ocultar colunas')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== 'undefined' && column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className='capitalize'
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {translate(columnLabels[column.id] ?? column.id)}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

