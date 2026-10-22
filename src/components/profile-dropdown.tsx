import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import useDialogState from '@/hooks/use-dialog-state'
import { useAuthStore } from '@/stores/auth-store'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { CalendarDays, ClipboardList, LayoutDashboard, ListTodo, MessagesSquare, Package, Settings2, Users } from 'lucide-react'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { toast } from 'sonner'
export function ProfileDropdown() {
  const { translate } = useLanguage()
  const [open, setOpen] = useDialogState()
  const email = useAuthStore((state) => state.auth.user?.email)
  const username = useAuthStore((state) => state.auth.user?.username)
  const displayName = useAuthStore((state) => state.auth.user?.displayName)
  const avatar = useAuthStore((state) => state.auth.user?.avatar)
  const user = useAuthStore((state) => state.auth.user)
  const setUser = useAuthStore((state) => state.auth.setUser)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  async function changePhoto(file?: File) {
    if (!file || !user) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Use uma imagem PNG, JPG ou WEBP.')
      return
    }
    if (file.size > 600 * 1024) {
      toast.error('A foto deve ter no máximo 600 KB.')
      return
    }
    setUploadingPhoto(true)
    try {
      const nextAvatar = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
        reader.readAsDataURL(file)
      })
      const response = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName || username || 'Usuário', avatar: nextAvatar }),
      })
      const result = await response.json() as { profile?: { displayName?: string; avatar?: string }; error?: string }
      if (!response.ok || !result.profile) throw new Error(result.error || 'Não foi possível atualizar a foto.')
      setUser({ ...user, displayName: result.profile.displayName || user.displayName, avatar: result.profile.avatar || '' })
      toast.success('Foto de perfil atualizada.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a foto.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
            <Avatar className='h-8 w-8'>
              <AvatarImage src={avatar || '/images/verdant-heart.webp'} width={256} height={256} alt={displayName || username || 'Perfil'} />
              <AvatarFallback>{(displayName || username || 'V').slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='max-h-[75svh] w-64 overflow-y-auto' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex items-center gap-3'>
              <Avatar className='h-11 w-11 shrink-0'>
                <AvatarImage src={avatar || '/images/verdant-heart.webp'} width={256} height={256} alt={displayName || username || 'Perfil'} />
                <AvatarFallback>{(displayName || username || 'V').slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm leading-none font-medium'>{displayName || username || translate('Equipe Verdant')}</p>
                <p className='mt-1 truncate text-xs leading-none text-muted-foreground'>{email || translate('Acesso interno')}</p>
                <label className='mt-2 inline-flex cursor-pointer text-xs font-medium text-primary hover:underline' onClick={(event) => event.stopPropagation()}>
                  {uploadingPhoto ? 'Salvando foto…' : 'Trocar foto'}
                  <input
                    className='sr-only'
                    type='file'
                    accept='image/png,image/jpeg,image/webp'
                    disabled={uploadingPhoto}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      void changePhoto(event.currentTarget.files?.[0])
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className='text-xs text-muted-foreground'>{<LocalizedText text={"Acesso rápido"} />}</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem asChild><Link to='/'><LayoutDashboard className='me-2 size-4' />{<LocalizedText text={"Resumo"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/tasks'><ListTodo className='me-2 size-4' />{<LocalizedText text={"Tarefas"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/apps'><Package className='me-2 size-4' />Apps</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/chats'><MessagesSquare className='me-2 size-4' />{<LocalizedText text={"Conversas"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/users'><Users className='me-2 size-4' />{<LocalizedText text={"Acessos ao painel"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/verdant/agenda'><CalendarDays className='me-2 size-4' />{<LocalizedText text={"Agenda de eventos"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/verdant/conteudo'><ClipboardList className='me-2 size-4' />{<LocalizedText text={"Conteúdo"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/verdant/escalas'><ClipboardList className='me-2 size-4' />{<LocalizedText text={"Escalas"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/verdant/formularios'><ClipboardList className='me-2 size-4' />{<LocalizedText text={"Formulários"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/verdant/listas'><ClipboardList className='me-2 size-4' />{<LocalizedText text={"Listas"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/verdant/respostas'><ClipboardList className='me-2 size-4' />{<LocalizedText text={"Respostas"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/verdant/cadastros'><Users className='me-2 size-4' />{<LocalizedText text={"Cadastros"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/verdant/configuracoes'><Settings2 className='me-2 size-4' />{<LocalizedText text={"Configurações Verdant"} />}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to='/settings'><Settings2 className='me-2 size-4' />{<LocalizedText text={"Meu perfil"} />}</Link></DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>{<LocalizedText text={"Sair"} />}<DropdownMenuShortcut className='text-current'>
              ⇧⌘Q
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}

