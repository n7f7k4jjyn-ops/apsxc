import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { Trash2, UserX, UserCheck, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { sleep } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { type User } from '../data/schema'
import { UsersMultiDeleteDialog } from './users-multi-delete-dialog'

type DataTableBulkActionsProps<TData> = {
  table: Table<TData>
}

export function DataTableBulkActions<TData>({
  table,
}: DataTableBulkActionsProps<TData>) {
  const { language, translate } = useLanguage()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleBulkStatusChange = (status: 'active' | 'inactive') => {
    const selectedUsers = selectedRows.map((row) => row.original as User)
    toast.promise(sleep(2000), {
      loading: translate(status === 'active' ? 'Ativando pessoas...' : 'Desativando pessoas...'),
      success: () => {
        table.resetRowSelection()
        if (language === 'en') {
          return `${selectedUsers.length} ${selectedUsers.length === 1 ? 'person' : 'people'} ${status === 'active' ? 'activated' : 'deactivated'}.`
        }
        return `${selectedUsers.length} ${selectedUsers.length > 1 ? 'pessoas' : 'pessoa'} ${status === 'active' ? 'ativadas' : 'desativadas'}.`
      },
      error: translate(status === 'active' ? 'Erro ao ativar pessoas.' : 'Erro ao desativar pessoas.'),
    })
    table.resetRowSelection()
  }

  const handleBulkInvite = () => {
    const selectedUsers = selectedRows.map((row) => row.original as User)
    toast.promise(sleep(2000), {
      loading: translate('Enviando convites...'),
      success: () => {
        table.resetRowSelection()
        return language === 'en'
          ? `Invitation sent to ${selectedUsers.length} ${selectedUsers.length === 1 ? 'person' : 'people'}.`
          : `Convite enviado para ${selectedUsers.length} ${selectedUsers.length > 1 ? 'pessoas' : 'pessoa'}.`
      },
      error: translate('Erro ao enviar convites'),
    })
    table.resetRowSelection()
  }

  return (
    <>
      <BulkActionsToolbar table={table} entityName={translate('pessoa')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              size='icon'
              onClick={handleBulkInvite}
              className='size-8'
              aria-label={translate('Convidar pessoas selecionadas')}
              title={translate('Convidar pessoas selecionadas')}
            >
              <Mail />
              <span className='sr-only'>{<LocalizedText text="Convidar pessoas selecionadas" />}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{<LocalizedText text="Convidar pessoas selecionadas" />}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              size='icon'
              onClick={() => handleBulkStatusChange('active')}
              className='size-8'
              aria-label={translate('Ativar pessoas selecionadas')}
              title={translate('Ativar pessoas selecionadas')}
            >
              <UserCheck />
              <span className='sr-only'>{<LocalizedText text="Ativar pessoas selecionadas" />}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{<LocalizedText text="Ativar pessoas selecionadas" />}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              size='icon'
              onClick={() => handleBulkStatusChange('inactive')}
              className='size-8'
              aria-label={translate('Desativar pessoas selecionadas')}
              title={translate('Desativar pessoas selecionadas')}
            >
              <UserX />
              <span className='sr-only'>{<LocalizedText text="Desativar pessoas selecionadas" />}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{<LocalizedText text="Desativar pessoas selecionadas" />}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='destructive'
              size='icon'
              onClick={() => setShowDeleteConfirm(true)}
              className='size-8'
              aria-label={translate('Excluir pessoas selecionadas')}
              title={translate('Excluir pessoas selecionadas')}
            >
              <Trash2 />
              <span className='sr-only'>{<LocalizedText text="Excluir pessoas selecionadas" />}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{<LocalizedText text="Excluir pessoas selecionadas" />}</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      <UsersMultiDeleteDialog
        table={table}
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      />
    </>
  )
}

