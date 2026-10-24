import { useEffect } from 'react'
import { Outlet, useLocation, useRouter } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { ChatNotifications } from '@/components/layout/chat-notifications'
import { SkipToMain } from '@/components/skip-to-main'

function NavigationLifecycle() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const router = useRouter()
  const { setOpenMobile } = useSidebar()
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])
  useEffect(() => {
    if (pathname !== '/') return
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string }
      }
    ).connection
    if (connection?.saveData || connection?.effectiveType?.includes('2g'))
      return
    const timer = window.setTimeout(() => {
      void router.preloadRoute({ to: '/verdant/agenda' }).catch(() => undefined)
      void router
        .preloadRoute({ to: '/verdant/inscricoes' })
        .catch(() => undefined)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [pathname, router])
  return null
}

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <NavigationLifecycle />
          <AppSidebar />
          <ChatNotifications />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              '@container/content',

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              'has-data-[layout=fixed]:h-svh',

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {children ?? <Outlet />}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}
