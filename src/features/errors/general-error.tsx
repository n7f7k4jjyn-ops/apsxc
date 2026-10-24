import { useEffect } from 'react'
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { trackNavigation } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { LocalizedText } from '@/context/language-provider'
import { Button } from '@/components/ui/button'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
  reset?: () => void
}

export function GeneralError({
  className,
  minimal = false,
  reset,
}: GeneralErrorProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  useEffect(() => {
    trackNavigation('route_error', pathname, { reason: 'render_error' })
  }, [pathname])
  return (
    <main
      id='content'
      tabIndex={-1}
      role='alert'
      className={cn('h-svh w-full p-4', className)}
    >
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        {!minimal && (
          <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        )}
        <span className='font-medium'>Ops! Algo deu errado {`:')`}</span>
        <p className='text-center text-muted-foreground'>
          {
            <LocalizedText
              text='Pedimos desculpas pelo inconveniente.'
              leadingSpace
              trailingSpace
            />
          }
          <br />
          {
            <LocalizedText
              text='Tente novamente mais tarde.'
              leadingSpace
              trailingSpace
            />
          }
        </p>
        <div className='mt-6 flex flex-wrap gap-4'>
          <Button
            variant='outline'
            onClick={() => {
              trackNavigation('cta_click', pathname, { action: 'retry_route' })
              void router.invalidate().then(() => reset?.())
            }}
          >
            <LocalizedText text='Tentar novamente' />
          </Button>
          {!minimal && (
            <Button onClick={() => navigate({ to: '/' })}>
              {<LocalizedText text='Ir para o início' />}
            </Button>
          )}
        </div>
      </div>
    </main>
  )
}
