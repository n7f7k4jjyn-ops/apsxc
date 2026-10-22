import { Link } from '@tanstack/react-router'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

export function TeamSwitcher() {
  return <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild className='h-auto justify-center px-2 py-3 hover:bg-transparent active:bg-transparent'><Link to='/' aria-label='Resumo Verdant' className='flex w-full items-center justify-center'><img src='/images/verdant-logo-colorida.webp' width={640} height={349} alt='Verdant' className='h-auto max-h-16 w-full max-w-40 object-contain group-data-[collapsible=icon]:max-h-10 group-data-[collapsible=icon]:max-w-10' /></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
}
