import { Link, useLocation } from '@tanstack/react-router'
import {
  CalendarDays,
  ClipboardList,
  FileText,
  House,
  Menu,
} from 'lucide-react'
import { trackNavigation } from '@/lib/analytics'
import { isNavigationActive } from '@/lib/navigation'
import { operationContext } from '@/lib/operation-context'
import { useLanguage } from '@/context/language-provider'
import { useSidebar } from '@/components/ui/sidebar'

const shortcuts = [
  { to: '/', title: 'Início', Icon: House },
  { to: '/verdant/agenda', title: 'Agenda', Icon: CalendarDays },
  { to: '/verdant/inscricoes', title: 'Inscrições', Icon: ClipboardList },
  { to: '/verdant/exportacoes', title: 'Relatórios', Icon: FileText },
] as const

export function MobileBottomNav() {
  const location = useLocation()
  const { translate } = useLanguage()
  const { openMobile, setOpenMobile } = useSidebar()
  const search = location.search as Record<string, unknown>
  return (
    <nav
      className='mobile-bottom-nav'
      aria-label={translate('Navegação mobile')}
    >
      {shortcuts.map(({ to, title, Icon }) => (
        <Link
          key={to}
          to={to}
          search={operationContext(search, to)}
          aria-current={
            isNavigationActive(location.pathname, to) ? 'page' : undefined
          }
          onClick={() =>
            trackNavigation('menu_click', location.pathname, {
              destination: to,
            })
          }
        >
          <Icon size={20} aria-hidden='true' />
          <span>{translate(title)}</span>
        </Link>
      ))}
      <button
        type='button'
        aria-expanded={openMobile}
        aria-haspopup='dialog'
        onClick={() => setOpenMobile(true)}
      >
        <Menu size={20} aria-hidden='true' />
        <span>{translate('Mais')}</span>
      </button>
    </nav>
  )
}
