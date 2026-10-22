import { LocalizedText, useLanguage } from '@/context/language-provider'
import { Outlet } from '@tanstack/react-router'
import { Monitor, Bell, Palette, Wrench, UserCog } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { SidebarNav } from './components/sidebar-nav'

const sidebarNavItems = [
  {
    title: 'Perfil',
    href: '/settings',
    icon: <UserCog size={18} />,
  },
  {
    title: 'Conta',
    href: '/settings/account',
    icon: <Wrench size={18} />,
  },
  {
    title: 'Aparência',
    href: '/settings/appearance',
    icon: <Palette size={18} />,
  },
  {
    title: 'Notificações',
    href: '/settings/notifications',
    icon: <Bell size={18} />,
  },
  {
    title: 'Exibição',
    href: '/settings/display',
    icon: <Monitor size={18} />,
  },
]

export function Settings() {
  const { translate } = useLanguage()
  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <div className='min-w-0 flex-1'><Search /></div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <ThemeSwitch />
          <div className='hidden sm:block'><ConfigDrawer /></div>
          <ProfileDropdown />
        </div>
      </Header>

      <Main fixed>
        <div className='space-y-0.5'>
          <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>{<LocalizedText text="Configurações" leadingSpace trailingSpace />}</h1>
          <p className='text-muted-foreground'>{<LocalizedText text="Gerencie as configurações da conta e as preferências de e-mail." leadingSpace trailingSpace />}</p>
        </div>
        <Separator className='my-4 lg:my-6' />
        <div className='flex flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12'>
          <aside className='top-0 lg:sticky lg:w-1/5'>
            <SidebarNav items={sidebarNavItems.map((item) => ({ ...item, title: translate(item.title) }))} />
          </aside>
          <div className='flex w-full min-w-0 overflow-y-auto p-1'>
            <Outlet />
          </div>
        </div>
      </Main>
    </>
  )
}

