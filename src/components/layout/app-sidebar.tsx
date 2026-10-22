import { useEffect, useState } from 'react'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
// import { AppTitle } from './app-title'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { type NavGroup as NavGroupType, type NavItem } from './types'
import { ScopeConnectAttribution } from './scope-connect-attribution'
import { TeamSwitcher } from './team-switcher'
import { InstallAppButtons } from './install-app-buttons'
import { useLanguage } from '@/context/language-provider'
import { useAuthStore } from '@/stores/auth-store'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { translate } = useLanguage()
  const roles = useAuthStore((state) => state.auth.user?.role ?? [])
  const isAdmin = roles.includes('admin')
  const canChat = isAdmin || roles.includes('operator')
  const [navigation, setNavigation] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/preferences', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => response.ok ? await response.json() as { navigation?: string[] } : null)
      .then((result) => { if (alive && result?.navigation?.length) setNavigation(result.navigation) })
      .catch(() => undefined)
    const onPreferences = (event: Event) => setNavigation((event as CustomEvent<string[]>).detail)
    window.addEventListener('verdant:navigation-preferences', onPreferences)
    return () => { alive = false; window.removeEventListener('verdant:navigation-preferences', onPreferences) }
  }, [])
  const translatedGroups: NavGroupType[] = sidebarData.navGroups.map((group) => ({
    title: translate(group.title),
    items: group.items.map((item): NavItem => {
      if (item.items) {
        return {
          ...item,
          title: translate(item.title),
          items: item.items.map((child) => ({ ...child, title: translate(child.title) })),
        }
      }
      return { ...item, title: translate(item.title) }
    }),
  }))
  const roleFilteredGroups = translatedGroups.flatMap((group) => {
    const items = group.items.flatMap((item): NavItem[] => {
      if (item.items) {
        const children = item.items.filter((child) => {
          const url = String(child.url)
          return (url !== '/users' || isAdmin) && (url !== '/chats' || canChat)
        })
        return children.length ? [{ ...item, items: children }] : []
      }
      return item.url && (String(item.url) !== '/users' || isAdmin) && (!['/verdant/escalas', '/verdant/financeiro'].includes(String(item.url)) || isAdmin) && (String(item.url) !== '/chats' || canChat) ? [item] : []
    })
    return items.length ? [{ ...group, items }] : []
  })
  const navGroups: NavGroupType[] = navigation
    ? roleFilteredGroups.flatMap((group) => {
      const items = group.items.flatMap((item): NavItem[] => {
        if (item.items) {
          const children = item.items.filter((child) => navigation.includes(String(child.url)))
          return children.length ? [{ ...item, items: children }] : []
        }
        return item.url && (navigation.includes(String(item.url)) || (String(item.url)==='/verdant/escalas' && navigation.includes('/verdant/agenda'))) ? [item] : []
      })
      return items.length ? [{ ...group, items }] : []
    })
    : roleFilteredGroups
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <TeamSwitcher />

        {/* Replace <TeamSwitch /> with the following <AppTitle />
         /* if you want to use the normal app title instead de TeamSwitch dropdown */}
        {/* <AppTitle /> */}
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <InstallAppButtons />
        <ScopeConnectAttribution />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
