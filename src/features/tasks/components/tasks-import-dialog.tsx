import { LocalizedText, useLanguage } from '@/context/language-provider'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useTasks } from './tasks-provider'

const createImportSchema = (translate: (text: string) => string) => z.object({ file: z.instanceof(FileList, { error: translate('Selecione um arquivo CSV.') }).refine((files) => files.length > 0, translate('Selecione um arquivo CSV.')).refine((files) => files[0]?.name.toLowerCase().endsWith('.csv'), translate('Envie um arquivo com extensão .csv.')) })
type Props = { open: boolean; onOpenChange: (open: boolean) => void }
type TaskInput = { title: string; description: string; assignee: string; dueDate: string; status: string; label: string; priority: string }

function rowsFromCsv(source: string) {
  const text = source.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = first.includes(';') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell.trim()); cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cell += char
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

const keyOf = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

function tasksFromCsv(source: string): TaskInput[] {
  const rows = rowsFromCsv(source)
  if (!rows.length) throw new Error('O arquivo não contém tarefas.')
  const known = new Set(['titulo', 'title', 'tarefa', 'descricao', 'description', 'responsavel', 'assignee', 'prazo', 'duedate', 'status', 'categoria', 'label', 'prioridade', 'priority'])
  const hasHeader = rows[0].some((value) => known.has(keyOf(value)))
  const headers = hasHeader ? rows.shift()!.map(keyOf) : ['titulo', 'descricao', 'responsavel', 'prazo', 'status', 'categoria', 'prioridade']
  const index = (...names: string[]) => headers.findIndex((header) => names.includes(header))
  const value = (cells: string[], ...names: string[]) => { const position = index(...names); return position < 0 ? '' : cells[position] ?? '' }
  const statusMap: Record<string, string> = { 'a fazer': 'backlog', backlog: 'backlog', pendente: 'todo', todo: 'todo', 'em andamento': 'in progress', 'in progress': 'in progress', concluida: 'done', done: 'done', cancelada: 'canceled', canceled: 'canceled' }
  const labelMap: Record<string, string> = { erro: 'bug', bug: 'bug', melhoria: 'feature', feature: 'feature', documentacao: 'documentation', documentation: 'documentation' }
  const priorityMap: Record<string, string> = { baixa: 'low', low: 'low', media: 'medium', medium: 'medium', alta: 'high', high: 'high', critica: 'critical', critical: 'critical' }
  return rows.map((cells) => {
    const title = value(cells, 'titulo', 'title', 'tarefa')
    if (!title) return null
    const rawStatus = value(cells, 'status').toLocaleLowerCase('pt-BR')
    const rawLabel = value(cells, 'categoria', 'label').toLocaleLowerCase('pt-BR')
    const rawPriority = value(cells, 'prioridade', 'priority').toLocaleLowerCase('pt-BR')
    return { title, description: value(cells, 'descricao', 'description'), assignee: value(cells, 'responsavel', 'assignee'), dueDate: value(cells, 'prazo', 'duedate'), status: statusMap[rawStatus] ?? 'todo', label: labelMap[keyOf(rawLabel)] ?? 'feature', priority: priorityMap[rawPriority] ?? 'medium' }
  }).filter((task): task is TaskInput => task !== null)
}

export function TasksImportDialog({ open, onOpenChange }: Props) {
  const { translate } = useLanguage()
  const { importTasks } = useTasks()
  const formSchema = createImportSchema(translate)
  const form = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), defaultValues: { file: undefined } })
  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const file = values.file[0]
      if (!file) throw new Error('Selecione um arquivo CSV.')
      const tasks = tasksFromCsv(await file.text())
      if (!tasks.length) throw new Error('Não encontrei linhas com título de tarefa.')
      if (tasks.length > 500) throw new Error('Importe no máximo 500 tarefas por arquivo.')
      await importTasks(tasks)
      form.reset()
      onOpenChange(false)
    } catch (error) {
      toast.error(translate(error instanceof Error ? error.message : 'Não foi possível importar o CSV.'))
    }
  }
  return <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) form.reset() }}>
    <DialogContent className='gap-2 sm:max-w-lg'><DialogHeader className='text-start'><DialogTitle>{<LocalizedText text="Importar tarefas" />}</DialogTitle><DialogDescription>{<LocalizedText text="CSV com colunas: Título, Descrição, Responsável (nome de usuário), Prazo (AAAA-MM-DD), Status, Categoria e Prioridade." />}</DialogDescription></DialogHeader>
      <Form {...form}><form id='task-import-form' onSubmit={form.handleSubmit(onSubmit)}><FormField control={form.control} name='file' render={({ field: { name, onBlur, onChange, ref } }) => <FormItem className='my-2'><FormLabel>{<LocalizedText text="Arquivo CSV" />}</FormLabel><FormControl><Input type='file' accept='.csv,text/csv' name={name} onBlur={onBlur} onChange={(event) => onChange(event.target.files)} ref={ref} /></FormControl><FormMessage /></FormItem>} /><DialogFooter className='gap-2'><DialogClose asChild><Button type='button' variant='outline'>{<LocalizedText text="Cancelar" />}</Button></DialogClose><Button type='button' onClick={form.handleSubmit(onSubmit)}><LocalizedText text="Importar" /></Button></DialogFooter></form></Form>
    </DialogContent>
  </Dialog>
}
