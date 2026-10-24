import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { trackNavigation } from '@/lib/analytics'
import {
  getNavigationPage,
  isNavigationActive,
  navigationPages,
  normalizePath,
} from '@/lib/navigation'
import { useLanguage } from '@/context/language-provider'

export function AppQuickNav() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const admin = useAuthStore((state) => state.auth.user?.role.includes('admin'))
  const { translate } = useLanguage()
  const links = navigationPages.filter(
    (page) => page.quick && (!page.admin || admin)
  )
  const activePage = links.find((page) => page.path === normalizePath(pathname))
  return (
    <nav
      aria-label={translate('Navegação rápida do aplicativo')}
      className='max-w-full min-w-0 border-b bg-background px-3 py-2 sm:px-4'
    >
      <select
        aria-label={translate('Ir para página')}
        className='min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm font-medium md:hidden'
        value={activePage?.path ?? ''}
        onChange={(event) => {
          const destination = event.target.value
          trackNavigation('menu_click', pathname, { destination })
          void navigate({ to: destination })
        }}
      >
        {!activePage && (
          <option value='' disabled>
            {translate(getNavigationPage(pathname).title)}
          </option>
        )}
        {links.map(({ title, path }) => (
          <option key={path} value={path}>
            {translate(title)}
          </option>
        ))}
      </select>
      <div className='hidden items-center gap-1 overflow-x-auto md:flex'>
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
      </div>
    </nav>
  )
}
