import { Link, useLocation } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { trackNavigation } from '@/lib/analytics'
import { isNavigationActive, navigationPages } from '@/lib/navigation'
import { useLanguage } from '@/context/language-provider'

export function AppQuickNav() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const admin = useAuthStore((state) => state.auth.user?.role.includes('admin'))
  const { translate } = useLanguage()
  const links = navigationPages.filter(
    (page) => page.quick && (!page.admin || admin)
  )
  return (
    <nav
      aria-label='Navegação rápida do aplicativo'
      className='flex max-w-full items-center gap-1 overflow-x-auto border-b bg-background px-3 py-2 sm:px-4'
    >
      {links.map(({ title, path: to }) => (
        <Link
          key={to}
          to={to}
          aria-current={isNavigationActive(pathname, to) ? 'page' : undefined}
          onClick={() =>
            trackNavigation('menu_click', pathname, { destination: to })
          }
          className={`inline-flex min-h-11 shrink-0 items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent ${isNavigationActive(pathname, to) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          {translate(title)}
        </Link>
      ))}
    </nav>
  )
}
