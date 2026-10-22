import { type ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type LogoProps = ImgHTMLAttributes<HTMLImageElement>

export function Logo({ className, alt = 'Logo Verdant', ...props }: LogoProps) {
  return (
    <>
      <img
        {...props}
        src='/images/verdant-logo-preta.png'
        alt={alt}
        className={cn('h-12 w-auto max-w-full object-contain dark:hidden', className)}
      />
      <img
        {...props}
        src='/images/verdant-logo-branca.png'
        alt={alt}
        className={cn('hidden h-12 w-auto max-w-full object-contain dark:block', className)}
      />
    </>
  )
}
