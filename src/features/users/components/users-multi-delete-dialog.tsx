'use client'

import { LocalizedText, useLanguage } from '@/context/language-provider'

import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { sleep } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
type UserMultiDeleteDialogProps<TData> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: Table<TData>
}

export function UsersMultiDeleteDialog<TData>({
  open,
  onOpenChange,
  table,
}: UserMultiDeleteDialogProps<TData>) {
  const { language, translate } = useLanguage()
  const confirmWord = language === 'en' ? 'DELETE' : 'EXCLUIR'
  const [value, setValue] = useState('')

  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleDelete = () => {
    if (value.trim() !== confirmWord) {
      toast.error(language === 'en' ? `Type "${confirmWord}" to confirm.` : `Digite "${confirmWord}" para confirmar.`)
      return
    }

    onOpenChange(false)

    toast.promise(sleep(2000), {
      loading: translate('Excluindo pessoas...'),
      success: () => {
        setValue('')
        table.resetRowSelection()
        return language === 'en'
          ? `${selectedRows.length} ${selectedRows.length === 1 ? 'person deleted' : 'people deleted'}.`
          : `${selectedRows.length} ${selectedRows.length > 1 ? 'pessoas excluídas' : 'pessoa excluída'}.`
      },
      error: translate('Falha ao excluir as pessoas.'),
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      form='users-multi-delete-form'
      disabled={value.trim() !== confirmWord}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
          />{' '}
          {language === 'en'
            ? `Delete ${selectedRows.length} ${selectedRows.length === 1 ? 'person' : 'people'}`
            : `${translate('Excluir')} ${selectedRows.length} ${selectedRows.length > 1 ? 'pessoas' : 'pessoa'}`}
        </span>
      }
      desc={
        <form
          id='users-multi-delete-form'
          onSubmit={(e) => {
            e.preventDefault()
            handleDelete()
          }}
          className='space-y-4'
        >
          <p className='mb-2'>
            {language === 'en'
              ? `Are you sure you want to delete the selected ${selectedRows.length === 1 ? 'person' : 'people'}?`
              : `Tem certeza de que deseja excluir ${selectedRows.length > 1 ? 'as pessoas selecionadas' : 'a pessoa selecionada'}?`} <br />{<LocalizedText text="Esta ação não pode ser desfeita." leadingSpace trailingSpace />}</p>

          <Label className='my-4 flex flex-col items-start gap-1.5'>
            <span>{language === 'en' ? `Type "${confirmWord}" to confirm:` : `Digite "${confirmWord}" para confirmar:`}</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={language === 'en' ? `Type "${confirmWord}" to confirm.` : `Digite "${confirmWord}" para confirmar.`}
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

