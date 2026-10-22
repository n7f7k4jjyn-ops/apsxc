/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ClerkProvider } from '@clerk/react'
import { ExternalLink, Key } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ConfigDrawer } from '@/components/config-drawer'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

export const Route = createFileRoute('/clerk')({
  component: RouteComponent,
})

// Configure sua chave pública do Clerk.
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function RouteComponent() {
  if (!PUBLISHABLE_KEY) {
    return <MissingClerkPubKey />
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl='/clerk/sign-in'
      signInUrl='/clerk/sign-in'
      signUpUrl='/clerk/sign-up'
      signInFallbackRedirectUrl='/clerk/user-management'
      signUpFallbackRedirectUrl='/clerk/user-management'
    >
      <Outlet />
    </ClerkProvider>
  )
}

function MissingClerkPubKey() {
  const codeBlock =
    'bg-foreground/10 rounded-sm py-0.5 px-1 text-xs text-foreground font-bold'
  return (
    <AuthenticatedLayout>
      <div className='bg-backgroundh-16 flex justify-between p-4'>
        <SidebarTrigger variant='outline' className='scale-125 sm:scale-100' />
        <div className='space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
        </div>
      </div>
      <Main className='flex flex-col items-center justify-start'>
        <div className='max-w-2xl'>
          <Alert>
            <Key className='size-4' />
            <AlertTitle>Chave pública não encontrada!</AlertTitle>
            <AlertDescription>
              <p className='text-balance'>
                Gere uma chave pública no Clerk e adicione-a ao arquivo{' '}
                <code className={codeBlock}>.env</code>.
              </p>
            </AlertDescription>
          </Alert>

          <h1 className='mt-4 text-2xl font-bold'>Configure a chave de API do Clerk</h1>
          <div className='mt-4 flex flex-col gap-y-4 text-foreground/75'>
            <ol className='list-inside list-decimal space-y-1.5'>
              <li>
                No{' '}
                <a
                  href='https://go.clerk.com/GttUAaK'
                  target='_blank'
                  className='underline decoration-dashed underline-offset-4 hover:decoration-solid'
                >
                  Clerk
                  <sup>
                    <ExternalLink className='inline-block size-4' />
                  </sup>
                </a>{' '}
                Painel, acesse as chaves de API.
              </li>
              <li>
                Na seção <strong>Cópia rápida</strong>, copie a chave pública do Clerk.
              </li>
              <li>
                Rename <code className={codeBlock}>.env.example</code> to{' '}
                <code className={codeBlock}>.env</code>
              </li>
              <li>
                Cole a chave no arquivo <code className={codeBlock}>.env</code>.
              </li>
            </ol>
            <p>O resultado deve ficar parecido com este:</p>

            <div className='@container space-y-2 rounded-md bg-slate-800 px-3 py-3 text-sm text-slate-200'>
              <span className='ps-1'>.env</span>
              <pre className='overflow-auto overscroll-x-contain rounded bg-slate-950 px-2 py-1 text-xs'>
                <code>
                  <span className='before:text-slate-400 md:before:pe-2 md:before:content-["1."]'>
                    VITE_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
                  </span>
                </code>
              </pre>
            </div>
          </div>

          <Separator className='my-4 w-full' />

          <Alert>
            <AlertTitle>A integração com Clerk é opcional</AlertTitle>
            <AlertDescription>
              <p className='text-balance'>
                A integração com Clerk fica dentro de{' '}
                <code className={codeBlock}>src/routes/clerk</code>. If you plan
                Para usar o Clerk como serviço de autenticação, coloque{' '}
                <code className={codeBlock}>ClerkProvider</code> at the root
                route.
              </p>
              <p>
                Se você não pretende usar o Clerk, pode remover esta pasta e a dependência{' '}
                <code className={codeBlock}>@clerk/react</code>.
              </p>
              <p className='mt-2 text-sm'>
                Essa integração é modular e não afeta o restante da aplicação.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      </Main>
    </AuthenticatedLayout>
  )
}
