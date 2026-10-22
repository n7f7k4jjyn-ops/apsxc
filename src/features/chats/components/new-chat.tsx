import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { type ChatUser } from '../data/chat-types'

type User = Omit<ChatUser, 'messages'>

type NewChatProps = {
  users: User[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (usernames: string[]) => Promise<boolean>
}
export function NewChat({ users, onOpenChange, onCreate, open }: NewChatProps) {
  const { translate } = useLanguage()
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSelectUser = (user: User) => {
    if (!selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user])
    } else {
      handleRemoveUser(user.id)
    }
  }

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter((user) => user.id !== userId))
  }

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    // Limpar filtros selecionados users when dialog closes
    if (!newOpen) {
      setSelectedUsers([])
      setError('')
    }
  }

  async function startConversation() {
    if (!selectedUsers.length || saving) return
    setSaving(true)
    setError('')
    try {
      const created = await onCreate(selectedUsers.map((user) => user.username))
      if (created) handleOpenChange(false)
    } catch (reason) {
      setError(translate(reason instanceof Error ? reason.message : 'Não foi possível iniciar a conversa.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-150'>
        <DialogHeader>
          <DialogTitle>{<LocalizedText text="Nova mensagem" />}</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-baseline-last gap-2'>
            <span className='min-h-6 text-sm text-muted-foreground'>{<LocalizedText text="Para:" />}</span>
            {selectedUsers.map((user) => (
              <Badge key={user.id} variant='default'>
                {user.fullName}
                <button
                  type='button'
                  className='ms-1 rounded-full ring-offset-background outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2'
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRemoveUser(user.id)
                    }
                  }}
                  onClick={() => handleRemoveUser(user.id)}
                >
                  <X className='h-3 w-3 text-muted-foreground hover:text-foreground' />
                </button>
              </Badge>
            ))}
          </div>
          <Command className='rounded-lg border'>
            <CommandInput
              placeholder={translate('Buscar pessoas...')}
              className='text-foreground'
            />
            <CommandList>
              <CommandEmpty>{<LocalizedText text="Nenhuma pessoa encontrada." />}</CommandEmpty>
              <CommandGroup>
                {users.map((user) => (
                  <CommandItem
                    key={user.id}
                    onSelect={() => handleSelectUser(user)}
                    className='flex items-center justify-between gap-2 hover:bg-accent hover:text-accent-foreground'
                  >
                    <div className='flex items-center gap-2'>
                      <img
                        src={user.profile || '/placeholder.svg'}
                        alt={user.fullName}
                        className='h-8 w-8 rounded-full'
                      />
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium'>
                          {user.fullName}
                        </span>
                        <span className='text-xs text-accent-foreground/70'>
                          {user.username}
                        </span>
                      </div>
                    </div>

                    {selectedUsers.find((u) => u.id === user.id) && (
                      <Check className='h-4 w-4' />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {error && <p role='alert' className='text-sm text-destructive'>{error}</p>}
          <Button
            variant={'default'}
            onClick={() => void startConversation()}
            disabled={selectedUsers.length === 0 || saving}
          >{saving ? translate('Iniciando…') : <LocalizedText text="Conversar" leadingSpace trailingSpace />}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}


