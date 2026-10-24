import { Link, useLocation } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { trackNavigation } from '@/lib/analytics'
import { useLanguage } from '@/context/language-provider'
import { Button } from '@/components/ui/button'
import { type VerdantEvent } from './data'

const steps = [
  { path: '/verdant/listas', title: 'Listas' },
  { path: '/verdant/inscricoes', title: 'Inscrições' },
  { path: '/verdant/exportacoes', title: 'Relatórios' },
] as const

export function EventWorkflowNav({ event }: { event?: VerdantEvent }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const { translate } = useLanguage()
  if (!event) return null

  return (
    <nav
      aria-label={translate('Continuar neste evento')}
      className='mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3'
    >
      <div className='min-w-0 flex-1 basis-48'>
        <p className='text-xs text-muted-foreground'>
          {translate('Continuar neste evento')}
        </p>
        <p className='text-sm font-medium break-words'>{event.name}</p>
      </div>
      <div className='flex flex-wrap gap-2'>
        {steps
          .filter((step) => step.path !== pathname)
          .map((step) => (
            <Button key={step.path} asChild variant='outline' size='sm'>
              <Link
                to={step.path}
                search={{ event: event.id }}
                onClick={() =>
                  trackNavigation('menu_click', pathname, {
                    destination: step.path,
                  })
                }
              >
                {translate(step.title)}{' '}
                <ArrowRight aria-hidden='true' size={14} />
              </Link>
            </Button>
          ))}
      </div>
    </nav>
  )
}
