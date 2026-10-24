import { useEffect, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { trackNavigation } from '@/lib/analytics'
import { getNavigationPage } from '@/lib/navigation'

export function NavigationObserver() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const lastPath = useRef<string | undefined>(undefined)
  useEffect(() => {
    document.title = `${getNavigationPage(pathname).title} · Verdant`
    if (lastPath.current !== pathname) {
      trackNavigation('page_view', pathname)
      lastPath.current = pathname
      const main = document.getElementById('content')
      main?.focus({ preventScroll: true })
    }
  }, [pathname])
  return null
}
