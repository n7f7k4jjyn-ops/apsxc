import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AppQuickNav } from './app-quick-nav'
import { PageContext } from './page-context'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  ref?: React.Ref<HTMLElement>
}

export function Header({ className, fixed, children, ...props }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(
        (document.body.scrollTop || document.documentElement.scrollTop) > 10
      )
    }

    // Add scroll listener to the body
    document.addEventListener('scroll', onScroll, { passive: true })

    // Clean up the event listener on unmount
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      data-app-header=''
      className={cn(
        'z-50',
        fixed &&
          'header-fixed peer/header sticky top-0 w-[inherit] bg-background/95 backdrop-blur',
        scrolled && fixed ? 'shadow' : 'shadow-none',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'relative flex h-16 min-w-0 items-center gap-2 px-3 sm:gap-4 sm:p-4',
          scrolled &&
            fixed &&
            'after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg'
        )}
      >
        <SidebarTrigger variant='outline' className='hidden md:inline-flex' />
        <Separator orientation='vertical' className='hidden h-6 md:block' />
        {children}
      </div>
      <AppQuickNav />
      <PageContext />
    </header>
  )
}
