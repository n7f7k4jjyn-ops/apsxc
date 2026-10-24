import { Link, useLocation } from '@tanstack/react-router'
import { trackNavigation } from '@/lib/analytics'
import { LocalizedText } from '@/context/language-provider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function PageDataState({
  ready,
  connected,
  retry,
  children,
}: {
  ready: boolean
  connected: boolean
  retry: () => void
  children: React.ReactNode
}) {
  if (!ready) return <PageLoading />
  return (
    <>
      {!connected && <PageError retry={retry} />}
      {children}
    </>
  )
}

export function PageLoading() {
  return (
    <div
      role='status'
      aria-live='polite'
      className='w-full space-y-4 p-4 sm:p-6'
    >
      <p>
        <LocalizedText text='Carregando página…' />
      </p>
      <div aria-hidden='true' className='space-y-4'>
        <Skeleton className='h-8 w-2/3 max-w-sm' />
        <Skeleton className='h-5 w-1/2 max-w-lg' />
        <div className='grid gap-4 sm:grid-cols-3'>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className='h-32 w-full' />
          ))}
        </div>
      </div>
    </div>
  )
}

export function PageError({ retry }: { retry: () => void }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  return (
    <section
      role='alert'
      className='space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5'
    >
      <h2 className='font-semibold'>
        <LocalizedText text='Não foi possível carregar os dados.' />
      </h2>
      <p>
        <LocalizedText text='Verifique sua conexão e tente novamente. As alterações estão indisponíveis até reconectar.' />
      </p>
      <Button
        variant='outline'
        onClick={() => {
          trackNavigation('cta_click', pathname, { action: 'retry_data' })
          retry()
        }}
      >
        <LocalizedText text='Tentar novamente' />
      </Button>
    </section>
  )
}

export function EmptyEvents() {
  return (
    <section className='space-y-3 rounded-lg border border-dashed p-5'>
      <h2 className='font-semibold'>
        <LocalizedText text='Sua operação começa com um evento' />
      </h2>
      <p className='text-muted-foreground'>
        <LocalizedText text='Adicione uma data na agenda para organizar listas, inscrições e relatórios.' />
      </p>
      <Button asChild>
        <Link
          to='/verdant/agenda'
          onClick={() =>
            trackNavigation('cta_click', '/', {
              action: 'start_operation',
              destination: '/verdant/agenda',
            })
          }
        >
          <LocalizedText text='Abrir agenda' />
        </Link>
      </Button>
    </section>
  )
}
