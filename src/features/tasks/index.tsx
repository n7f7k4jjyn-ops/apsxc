import { LocalizedText } from '@/context/language-provider'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { PageError, PageLoading } from '@/components/page-state'
import { trackNavigation } from '@/lib/analytics'
import { TasksDialogs } from './components/tasks-dialogs'
import { TasksPrimaryButtons } from './components/tasks-primary-buttons'
import { TasksProvider, useTasks } from './components/tasks-provider'
import { TasksTable } from './components/tasks-table'

export function Tasks() {
  return (
    <TasksProvider>
      <TasksContent />
    </TasksProvider>
  )
}

function TasksContent() {
  const { tasks, loading, error, reload, setOpen } = useTasks()
  return (
    <>
      <Header fixed>
        <div className='min-w-0 flex-1'><Search /></div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <ThemeSwitch />
          <div className='hidden sm:block'><ConfigDrawer /></div>
          <ProfileDropdown />
        </div>
      </Header>
      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>{<LocalizedText text="Tarefas" />}</h2>
            <p className='text-muted-foreground'>{<LocalizedText text="Atribua responsáveis e prazos para acompanhar o trabalho da equipe." />}</p>
          </div>
          <TasksPrimaryButtons />
        </div>
        {loading ? <PageLoading /> : error ? <PageError retry={() => void reload()} /> : tasks.length === 0 ? (
          <section className='space-y-3 rounded-lg border border-dashed p-5'>
            <h2 className='font-semibold'><LocalizedText text='Nenhuma tarefa cadastrada.' /></h2>
            <p className='text-muted-foreground'><LocalizedText text='Crie uma tarefa e defina responsáveis e prazos para começar.' /></p>
            <Button onClick={() => {
              trackNavigation('cta_click', '/tasks', { action: 'create_task' })
              setOpen('create')
            }}><LocalizedText text='Criar tarefa' /></Button>
          </section>
        ) : <TasksTable data={tasks} />}
      </Main>
      <TasksDialogs />
    </>
  )
}
