import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import useDialogState from '@/hooks/use-dialog-state'
import { type Task } from '../data/schema'

type TeamMember = { username: string; displayName: string }
type TasksDialogType = 'create' | 'update' | 'delete' | 'import'
type TaskInput = Omit<Task, 'id' | 'assigneeName' | 'createdAt' | 'updatedAt'>

type TasksContextType = {
  open: TasksDialogType | null
  setOpen: (value: TasksDialogType | null) => void
  currentRow: Task | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Task | null>>
  tasks: Task[]
  team: TeamMember[]
  loading: boolean
  error: string
  reload: () => Promise<void>
  saveTask: (task: TaskInput, id?: string, quiet?: boolean) => Promise<void>
  importTasks: (tasks: TaskInput[]) => Promise<void>
  deleteTask: (id: string) => Promise<void>
}

const TasksContext = React.createContext<TasksContextType | null>(null)

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<TasksDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Task | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [taskResponse, teamResponse] = await Promise.all([
        fetch('/api/tasks', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/team/assignees', { credentials: 'same-origin', cache: 'no-store' }),
      ])
      if (!taskResponse.ok || !teamResponse.ok) throw new Error('Não foi possível carregar tarefas e equipe.')
      const taskResult = await taskResponse.json() as { tasks: Task[] }
      const teamResult = await teamResponse.json() as { users: TeamMember[] }
      setTasks(taskResult.tasks)
      setTeam(teamResult.users)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao carregar tarefas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const saveTask = useCallback(async (task: TaskInput, id?: string, quiet = false) => {
    const response = await fetch(id ? `/api/tasks/${encodeURIComponent(id)}` : '/api/tasks', {
      method: id ? 'PUT' : 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    })
    const result = await response.json() as Task & { error?: string }
    if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a tarefa.')
    setTasks((current) => id ? current.map((item) => item.id === id ? result : item) : [result, ...current])
    if (!quiet) toast.success(id ? 'Tarefa atualizada.' : 'Tarefa criada.')
  }, [])

  const deleteTask = useCallback(async (id: string) => {
    const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
    const result = await response.json() as { error?: string }
    if (!response.ok) throw new Error(result.error || 'Não foi possível excluir a tarefa.')
    setTasks((current) => current.filter((item) => item.id !== id))
    toast.success('Tarefa excluída.')
  }, [])

  const importTasks = useCallback(async (items: TaskInput[]) => {
    const response = await fetch('/api/tasks/import', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: items }) })
    const result = await response.json() as { tasks?: Task[]; error?: string }
    if (!response.ok || !result.tasks) throw new Error(result.error || 'Não foi possível importar as tarefas.')
    setTasks((current) => [...result.tasks!, ...current])
    toast.success(`${result.tasks.length} ${result.tasks.length === 1 ? 'tarefa importada' : 'tarefas importadas'}.`)
  }, [])

  return (
    <TasksContext.Provider value={{ open, setOpen, currentRow, setCurrentRow, tasks, team, loading, error, reload: load, saveTask, importTasks, deleteTask }}>
      {children}
    </TasksContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTasks = () => {
  const tasksContext = React.useContext(TasksContext)
  if (!tasksContext) throw new Error('useTasks has to be used within <TasksContext>')
  return tasksContext
}
