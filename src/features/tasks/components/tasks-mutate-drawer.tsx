import { LocalizedText, useLanguage } from '@/context/language-provider'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { type Task } from '../data/schema'
import { useTasks } from './tasks-provider'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; currentRow?: Task }
const createSchema = (translate: (text: string) => string) => z.object({
  title: z.string().trim().min(2, translate('Informe um título.')),
  description: z.string().max(2000),
  status: z.string().min(1),
  label: z.string().min(1),
  priority: z.string().min(1),
  assignee: z.string(),
  dueDate: z.string(),
})
type FormValues = z.infer<ReturnType<typeof createSchema>>

export function TasksMutateDrawer({ open, onOpenChange, currentRow }: Props) {
  const { translate } = useLanguage()
  const { team, saveTask } = useTasks()
  const [saving, setSaving] = useState(false)
  const schema = createSchema(translate)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: currentRow?.title ?? '', description: currentRow?.description ?? '',
      status: currentRow?.status ?? 'todo', label: currentRow?.label ?? 'feature',
      priority: currentRow?.priority ?? 'medium', assignee: currentRow?.assignee ?? '',
      dueDate: currentRow?.dueDate ?? '',
    },
  })

  useEffect(() => {
    if (!open) form.reset()
  }, [open, form])

  async function onSubmit(values: FormValues) {
    setSaving(true)
    try {
      await saveTask(values, currentRow?.id)
      onOpenChange(false)
      form.reset()
    } catch (error) {
      toast.error(translate(error instanceof Error ? error.message : 'Não foi possível salvar a tarefa.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader className='text-start'>
          <SheetTitle>{translate(currentRow ? 'Editar tarefa' : 'Nova tarefa')}</SheetTitle>
          <SheetDescription>{<LocalizedText text="Defina o que precisa ser feito, quem ficará responsável e até quando." />}</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form id='tasks-form' onSubmit={form.handleSubmit(onSubmit)} className='flex-1 space-y-5 overflow-y-auto px-4'>
            <FormField control={form.control} name='title' render={({ field }) => <FormItem><FormLabel>{<LocalizedText text="Título" />}</FormLabel><FormControl><Input {...field} maxLength={180} placeholder={translate('Ex.: revisar lista do evento')} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name='description' render={({ field }) => <FormItem><FormLabel>{<LocalizedText text="Descrição" />}</FormLabel><FormControl><Textarea {...field} maxLength={2000} rows={3} placeholder={translate('Detalhes para a pessoa responsável')} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name='assignee' render={({ field }) => <FormItem><FormLabel>{<LocalizedText text="Responsável" />}</FormLabel><FormControl><select {...field} className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'><option value=''>{<LocalizedText text="Sem responsável" />}</option>{team.map((member) => <option value={member.username} key={member.username}>{member.displayName} · {member.username}</option>)}</select></FormControl><FormMessage /></FormItem>} />
            {team.length === 0 && <p className='text-xs text-muted-foreground'>{<LocalizedText text="Nenhum usuário ativo foi configurado no servidor; cadastre a equipe em VERDANT_USERS_JSON para atribuir tarefas." />}</p>}
            <FormField control={form.control} name='dueDate' render={({ field }) => <FormItem><FormLabel>{<LocalizedText text="Prazo" />}</FormLabel><FormControl><Input {...field} type='date' /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name='status' render={({ field }) => <FormItem><FormLabel>{<LocalizedText text="Status" />}</FormLabel><FormControl><select {...field} className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'><option value='backlog'>{<LocalizedText text="A fazer" />}</option><option value='todo'>{<LocalizedText text="Pendente" />}</option><option value='in progress'>{<LocalizedText text="Em andamento" />}</option><option value='done'>{<LocalizedText text="Concluída" />}</option><option value='canceled'>{<LocalizedText text="Cancelada" />}</option></select></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name='label' render={({ field }) => <FormItem><FormLabel>{<LocalizedText text="Categoria" />}</FormLabel><FormControl><select {...field} className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'><option value='documentation'>{<LocalizedText text="Documentação" />}</option><option value='feature'>{<LocalizedText text="Melhoria" />}</option><option value='bug'>{<LocalizedText text="Erro" />}</option></select></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name='priority' render={({ field }) => <FormItem><FormLabel>{<LocalizedText text="Prioridade" />}</FormLabel><FormControl><select {...field} className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'><option value='low'>{<LocalizedText text="Baixa" />}</option><option value='medium'>{<LocalizedText text="Média" />}</option><option value='high'>{<LocalizedText text="Alta" />}</option><option value='critical'>{<LocalizedText text="Crítica" />}</option></select></FormControl><FormMessage /></FormItem>} />
          </form>
        </Form>
        <SheetFooter className='gap-2'><SheetClose asChild><Button variant='outline'>{<LocalizedText text="Cancelar" />}</Button></SheetClose><Button form='tasks-form' type='submit' disabled={saving}>{saving ? translate('Salvando…') : translate('Salvar tarefa')}</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

