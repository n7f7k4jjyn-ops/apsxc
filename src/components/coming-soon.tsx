import { Telescope } from 'lucide-react'

export function ComingSoon() {
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <Telescope size={72} />
        <h1 className='text-4xl leading-tight font-bold'>Em breve!</h1>
        <p className='text-center text-muted-foreground'>
          Esta página ainda não foi criada. <br />
          Em breve teremos novidades.
        </p>
      </div>
    </div>
  )
}
