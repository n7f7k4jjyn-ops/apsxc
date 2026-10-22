import { LocalizedText } from '@/context/language-provider'
import { Button } from '@/components/ui/button'

export function MaintenanceError() {
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>503</h1>
        <span className='font-medium'>{<LocalizedText text="Site em manutenção!" />}</span>
        <p className='text-center text-muted-foreground'>{<LocalizedText text="O site está indisponível no momento." leadingSpace trailingSpace />}<br />{<LocalizedText text="Voltaremos em breve." leadingSpace trailingSpace />}</p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline'>{<LocalizedText text="Saiba mais" />}</Button>
        </div>
      </div>
    </div>
  )
}

