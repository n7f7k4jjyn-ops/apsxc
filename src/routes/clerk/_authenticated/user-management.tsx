/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useAuth, UserButton } from '@clerk/react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { ClerkLogo } from '@/assets/clerk-logo'
import { Button } from '@/components/ui/button'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { LearnMore } from '@/components/learn-more'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { UsersDialogs } from '@/features/users/components/users-dialogs'
import { UsersPrimaryButtons } from '@/features/users/components/users-primary-buttons'
import { UsersProvider } from '@/features/users/components/users-provider'
import { UsersTable } from '@/features/users/components/users-table'
import { users } from '@/features/users/data/users'

export const Route = createFileRoute('/clerk/_authenticated/user-management')({
  component: UserManagement,
})

function UserManagement() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const [opened, setOpened] = useState(true)
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return (
      <div className='flex h-svh items-center justify-center'>
        <Loader2 className='size-8 animate-spin' />
      </div>
    )
  }

  if (!isSignedIn) {
    return <Unauthorized />
  }

  return (
    <UsersProvider>
      <Header fixed>
        <div className='min-w-0 flex-1'><Search /></div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <ThemeSwitch />
          <div className='hidden sm:block'><ConfigDrawer /></div>
          <UserButton />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Equipe</h2>
            <div className='flex gap-1'>
              <p className='text-muted-foreground'>
                Gerencie os acessos da equipe.
              </p>
              <LearnMore
                open={opened}
                onOpenChange={setOpened}
                contentProps={{ side: 'right' }}
              >
                <p>
                  Esta é a mesma página de{' '}
                  <Link
                    to='/users'
                    className='text-blue-500 underline decoration-dashed underline-offset-2'
                  >
                    '/users'
                  </Link>
                </p>

                <p className='mt-4'>
                  Você pode sair ou gerenciar sua conta pelo menu de perfil no canto superior direito.
                  <ExternalLink className='inline-block size-4' />
                </p>
              </LearnMore>
            </div>
          </div>
          <UsersPrimaryButtons />
        </div>
        <UsersTable data={users} navigate={navigate} search={search} />
      </Main>

      <UsersDialogs />
    </UsersProvider>
  )
}

const COUNTDOWN = 5 // Countdown second

function Unauthorized() {
  const navigate = useNavigate()
  const { history } = useRouter()

  const [opened, setOpened] = useState(true)
  const [cancelled, setCancelled] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN)

  // Set and run the countdown conditionally
  useEffect(() => {
    if (cancelled || opened) return
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [cancelled, opened])

  // Navigate to sign-in page when countdown hits 0
  useEffect(() => {
    if (countdown > 0) return
    navigate({ to: '/clerk/sign-in' })
  }, [countdown, navigate])

  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>401</h1>
        <span className='font-medium'>Acesso não autorizado</span>
        <p className='text-center text-muted-foreground'>
          Você precisa estar autenticado pelo Clerk{' '}
          <sup>
            <LearnMore open={opened} onOpenChange={setOpened}>
              <p>
                Esta é a mesma página de{' '}
                <Link
                  to='/users'
                  className='text-blue-500 underline decoration-dashed underline-offset-2'
                >
                  '/users'
                </Link>
                .{' '}
              </p>
              <p>Primeiro, entre usando o Clerk nesta página.</p>

              <p className='mt-4'>
                Depois de entrar, você poderá sair ou excluir sua conta pelo menu de perfil.
              </p>
            </LearnMore>
          </sup>
          <br />
          este conteúdo.
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' onClick={() => history.go(-1)}>
            Voltar
          </Button>
          <Button onClick={() => navigate({ to: '/clerk/sign-in' })}>
            <ClerkLogo className='invert' /> Entrar
          </Button>
        </div>
        <div className='mt-4 h-8 text-center'>
          {!cancelled && !opened && (
            <>
              <p>
                {countdown > 0
                  ? `Redirecionando para a página de entrada em ${countdown}s`
                  : 'Redirecionando...'}
              </p>
              <Button variant='link' onClick={() => setCancelled(true)}>
                Cancelar redirecionamento
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
