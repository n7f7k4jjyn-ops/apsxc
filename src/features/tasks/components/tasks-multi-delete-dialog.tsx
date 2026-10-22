'use client'

import { LocalizedText, useLanguage } from '@/context/language-provider'

import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
type TaskMultiDeleteDialogProps<TData> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: Table<TData>
  onDelete: (ids: string[]) => Promise<void>
}

export function TasksMultiDeleteDialog<TData>({
  open,
  onOpenChange,
  table,
  onDelete,
}: TaskMultiDeleteDialogProps<TData>) {
  const { language, translate } = useLanguage()
  const confirmWord = language === 'en' ? 'DELETE' : 'EXCLUIR'
  const [value, setValue] = useState('')

  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleDelete = async () => {
    if (value.trim() !== confirmWord) {
      toast.error(language === 'en' ? `Type "${confirmWord}" to confirm.` : `Digite "${confirmWord}" para confirmar.`)
      return
    }

    try {
      const ids = selectedRows.map((row) => String((row.original as { id: string }).id))
      await onDelete(ids)
      table.resetRowSelection()
      setValue('')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir as tarefas.')
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      disabled={value.trim() !== confirmWord}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
          />{' '}
          {language === 'en'
            ? `Delete ${selectedRows.length} ${selectedRows.length === 1 ? 'task' : 'tasks'}`
            : `${translate('Excluir')} ${selectedRows.length} ${selectedRows.length > 1 ? 'tarefas' : 'tarefa'}`}
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            {language === 'en'
              ? `Are you sure you want to delete the selected ${selectedRows.length === 1 ? 'task' : 'tasks'}?`
              : `Tem certeza de que deseja excluir ${selectedRows.length > 1 ? 'as tarefas selecionadas' : 'a tarefa selecionada'}?`} <br />{<LocalizedText text="Esta ação não pode ser desfeita." leadingSpace trailingSpace />}</p>

          <Label className='my-4 flex flex-col items-start gap-1.5'>
            <span>{language === 'en' ? `Type "${confirmWord}" to confirm:` : `Digite "${confirmWord}" para confirmar:`}</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleDelete()
                }
              }}
              placeholder={language === 'en' ? `Type "${confirmWord}" to confirm.` : `Digite "${confirmWord}" para confirmar.`}
              autoFocus
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>{<LocalizedText text="Atenção!" />}</AlertTitle>
            <AlertDescription>{<LocalizedText text="Esta ação é permanente e não pode ser desfeita." leadingSpace trailingSpace />}</AlertDescription>
          </Alert>
        </div>
      }
      handleConfirm={() => { void handleDelete() }}
      confirmText={translate('Excluir')}
      destructive
    />
  )
}
