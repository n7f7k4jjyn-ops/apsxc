'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { type User } from '../data/schema'

type UserDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
}

export function UsersDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: UserDeleteDialogProps) {
  const { translate } = useLanguage()
  const [value, setValue] = useState('')

  const handleDelete = () => {
    if (value.trim() !== currentRow.username) return

    onOpenChange(false)
    showSubmittedData(currentRow, translate('Pessoa excluída:'))
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      form='users-delete-form'
      disabled={value.trim() !== currentRow.username}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
          />{' '}
          <LocalizedText text='Excluir pessoa' />
        </span>
      }
      desc={
        <form
          id='users-delete-form'
          onSubmit={(e) => {
            e.preventDefault()
            handleDelete()
          }}
          className='space-y-4'
        >
          <p className='mb-2'>
            {translate('Tem certeza de que deseja excluir')}{' '}
            <span className='font-bold'>{currentRow.username}</span>?
            <br />
            {translate('Esta ação removerá permanentemente a pessoa com a permissão')}{' '}
            <span className='font-bold'>
              {currentRow.role.toUpperCase()}
            </span>{' '}
            {translate('do sistema. Isso não pode ser desfeito.')}
          </p>

          <Label className='my-2'>{<LocalizedText text="Usuário:" leadingSpace trailingSpace />}<Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={translate('Digite o nome de usuário para confirmar a exclusão.')}
              autoFocus
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>{<LocalizedText text="Atenção!" />}</AlertTitle>
            <AlertDescription>{<LocalizedText text="Esta ação é permanente e não pode ser desfeita." leadingSpace trailingSpace />}</AlertDescription>
          </Alert>
        </form>
      }
      confirmText={translate('Excluir')}
      destructive
    />
  )
}

