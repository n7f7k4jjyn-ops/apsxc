import { useEffect } from 'react'
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { trackNavigation } from '@/lib/analytics'
import { LocalizedText } from '@/context/language-provider'
import { Button } from '@/components/ui/button'

export function NotFoundError() {
  const navigate = useNavigate()
  const { history } = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  useEffect(() => {
    trackNavigation('route_error', pathname, { reason: 'not_found' })
  }, [pathname])
  return (
    <main id='content' tabIndex={-1} className='h-svh p-4'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>404</h1>
        <span className='font-medium'>
          {<LocalizedText text='Ops! Página não encontrada!' />}
        </span>
        <p className='text-center text-muted-foreground'>
          {
            <LocalizedText
              text='A página que você está procurando'
              leadingSpace
              trailingSpace
            />
          }
          <br />
          {
            <LocalizedText
              text='não existe ou pode ter sido removida.'
              leadingSpace
              trailingSpace
            />
          }
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' onClick={() => history.go(-1)}>
            {<LocalizedText text='Voltar' leadingSpace trailingSpace />}
          </Button>
          <Button
            onClick={() => {
              trackNavigation('cta_click', pathname, {
                destination: '/',
                action: 'return_home',
              })
              void navigate({ to: '/' })
            }}
          >
            {<LocalizedText text='Ir para o início' />}
          </Button>
        </div>
      </div>
    </main>
  )
}
