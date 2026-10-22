import { LocalizedText, useLanguage } from '@/context/language-provider'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { TasksImportDialog } from './tasks-import-dialog'
import { TasksMutateDrawer } from './tasks-mutate-drawer'
import { useTasks } from './tasks-provider'

export function TasksDialogs() {
  const { translate } = useLanguage()
  const { open, setOpen, currentRow, setCurrentRow, deleteTask } = useTasks()
  return (
    <>
      <TasksMutateDrawer
        key='task-create'
        open={open === 'create'}
        onOpenChange={(value) => setOpen(value ? 'create' : null)}
      />

      <TasksImportDialog
        key='tasks-import'
        open={open === 'import'}
        onOpenChange={(value) => setOpen(value ? 'import' : null)}
      />

      {currentRow && (
        <>
          <TasksMutateDrawer
            key={`task-update-${currentRow.id}`}
            open={open === 'update'}
            onOpenChange={(value) => {
              setOpen(value ? 'update' : null)
              if (value) return
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
          />

          <ConfirmDialog
            key='task-delete'
            destructive
            open={open === 'delete'}
            onOpenChange={(value) => {
              setOpen(value ? 'delete' : null)
              if (value) return
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            handleConfirm={() => {
              void deleteTask(currentRow.id).then(() => {
                setOpen(null)
                setCurrentRow(null)
              }).catch((error) => toast.error(translate(error instanceof Error ? error.message : 'Falha ao excluir.')))
            }}
            className='max-w-md'
            title={`${translate('Excluir esta tarefa:')} ${currentRow.id}?`}
            desc={
              <>
                Você está prestes a excluir a tarefa de ID{' '}
                <strong>{currentRow.id}</strong>. <br />{<LocalizedText text="Esta ação não pode ser desfeita." leadingSpace trailingSpace />}</>
            }
            confirmText={translate('Excluir')}
          />
        </>
      )}
    </>
  )
}

