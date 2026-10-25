import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function SummaryDetail({
  title,
  description,
  preview,
  children,
  className = '',
}: {
  title: string
  description: string
  preview: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Dialog>
      <Card className={className}>
        <CardHeader>
          <CardTitle className='text-base'>{title}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <p className='text-sm text-muted-foreground'>{preview}</p>
          <DialogTrigger asChild>
            <Button variant='outline' size='sm'>
              Ver {title.toLocaleLowerCase('pt-BR')}
            </Button>
          </DialogTrigger>
        </CardContent>
      </Card>
      <DialogContent className='verdant-summary sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
