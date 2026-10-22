import { LocalizedText } from '@/context/language-provider'
import { MailPlus, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUsers } from './users-provider'

export function UsersPrimaryButtons() {
  const { setOpen } = useUsers()
  return (
    <div className='flex gap-2'>
      <Button
        variant='outline'
        className='space-x-1'
        onClick={() => setOpen('invite')}
      >
        <span>{<LocalizedText text="Convidar pessoa" />}</span> <MailPlus size={18} />
      </Button>
      <Button className='space-x-1' onClick={() => setOpen('add')}>
        <span>{<LocalizedText text="Adicionar pessoa" />}</span> <UserPlus size={18} />
      </Button>
    </div>
  )
}

