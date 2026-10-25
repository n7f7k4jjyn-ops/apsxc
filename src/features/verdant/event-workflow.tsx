import { Link, useLocation } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { trackNavigation } from '@/lib/analytics'
import { useLanguage } from '@/context/language-provider'
import { Button } from '@/components/ui/button'
import { type VerdantEvent } from './data'

const steps = [
  { path: '/verdant/formularios', title: 'Formulários', admin: false },
  { path: '/verdant/listas', title: 'Listas', admin: false },
  { path: '/verdant/inscricoes', title: 'Inscrições', admin: false },
  { path: '/verdant/exportacoes', title: 'Relatórios', admin: false },
  { path: '/verdant/escalas', title: 'Escalas', admin: true },
  { path: '/verdant/financeiro', title: 'Financeiro', admin: true },
] as const

export function EventWorkflowNav({ event }: { event?: VerdantEvent }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const month = useLocation({
    select: (location) => (location.search as Record<string, unknown>).month,
  })
  const { translate } = useLanguage()
  const admin = useAuthStore((state) => state.auth.user?.role.includes('admin'))
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
          .filter((step) => step.path !== pathname && (!step.admin || admin))
          .map((step) => (
            <Button key={step.path} asChild variant='outline' size='sm'>
              <Link
                to={step.path}
                search={{
                  event: event.id,
                  ...(typeof month === 'string' &&
                  /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
                    ? { month }
                    : {}),
                }}
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
