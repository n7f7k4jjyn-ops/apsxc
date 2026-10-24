import { memo } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { trackNavigation } from '@/lib/analytics'
import { getBreadcrumbs, getNavigationPage } from '@/lib/navigation'
import { useLanguage } from '@/context/language-provider'

export const PageContext = memo(function PageContext() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const { translate } = useLanguage()
  const page = getNavigationPage(pathname)
  const breadcrumbs = getBreadcrumbs(pathname)

  return (
    <div className='min-w-0 border-b px-3 py-2 sm:px-4'>
      <p className='truncate font-semibold'>{translate(page.title)}</p>
      <nav aria-label={translate('Localização na navegação')}>
        <ol className='flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground'>
          {breadcrumbs.map((item, index) => (
            <li key={item.path} className='flex items-center gap-2'>
              {index > 0 && <span aria-hidden='true'>/</span>}
              {index === breadcrumbs.length - 1 ? (
                <span aria-current='page'>{translate(item.title)}</span>
              ) : (
                <Link
                  to={item.path}
                  className='inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline'
                  onClick={() =>
                    trackNavigation('breadcrumb_click', pathname, {
                      destination: item.path,
                    })
                  }
                >
                  {translate(item.title)}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
})
