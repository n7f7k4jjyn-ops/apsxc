import { LocalizedText } from '@/context/language-provider'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function ForbiddenError() {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>403</h1>
        <span className='font-medium'>{<LocalizedText text="Acesso proibido" />}</span>
        <p className='text-center text-muted-foreground'>{<LocalizedText text="Você não tem permissão" leadingSpace trailingSpace />}<br />{<LocalizedText text="para visualizar este conteúdo." leadingSpace trailingSpace />}</p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' onClick={() => history.go(-1)}>{<LocalizedText text="Voltar" leadingSpace trailingSpace />}</Button>
          <Button onClick={() => navigate({ to: '/' })}>{<LocalizedText text="Ir para o início" />}</Button>
        </div>
      </div>
    </div>
  )
}

