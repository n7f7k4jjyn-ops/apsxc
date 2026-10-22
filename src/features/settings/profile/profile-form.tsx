import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LocalizedText } from '@/context/language-provider'
import { useAuthStore } from '@/stores/auth-store'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Profile = {
  displayName: string
  username: string
  email: string
  avatar: string
}

export function ProfileForm() {
  const auth = useAuthStore((state) => state.auth)
  const [profile, setProfile] = useState<Profile>({
    displayName: auth.user?.displayName || '',
    username: auth.user?.username || '',
    email: auth.user?.email || '',
    avatar: auth.user?.avatar || '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void fetch('/api/profile', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { profile?: Profile; error?: string }
        if (!response.ok || !result.profile) throw new Error(result.error || 'Não foi possível carregar o perfil.')
        setProfile(result.profile)
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o perfil.'))
      .finally(() => setLoading(false))
  }, [])

  async function selectAvatar(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('Use PNG, JPG ou WEBP.')
    if (file.size > 600 * 1024) return toast.error('A foto deve ter no máximo 600 KB.')
    const avatar = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      reader.readAsDataURL(file)
    })
    setProfile((current) => ({ ...current, avatar }))
  }

  async function save() {
    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: profile.displayName, avatar: profile.avatar }),
      })
      const result = await response.json() as { profile?: Profile; error?: string }
      if (!response.ok || !result.profile) throw new Error(result.error || 'Não foi possível salvar o perfil.')
      setProfile(result.profile)
      auth.setUser(auth.user ? { ...auth.user, displayName: result.profile.displayName, avatar: result.profile.avatar } : auth.user)
      toast.success('Perfil atualizado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center gap-4 rounded-xl border p-4'>
        <Avatar className='h-20 w-20'>
          <AvatarImage src={profile.avatar || '/images/verdant-heart.webp'} alt={profile.displayName || profile.username || 'Perfil'} />
          <AvatarFallback>{(profile.displayName || profile.username || 'V').slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className='space-y-2'>
          <div><b>{profile.displayName || profile.username}</b><p className='text-sm text-muted-foreground'>@{profile.username}</p></div>
          <div className='flex flex-wrap gap-2'>
            <label className='inline-flex min-h-9 cursor-pointer items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent'>
              Alterar foto
              <input className='sr-only' type='file' accept='image/png,image/jpeg,image/webp' onChange={(event) => { void selectAvatar(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
            </label>
            {profile.avatar && <Button type='button' variant='outline' size='sm' onClick={() => setProfile((current) => ({ ...current, avatar: '' }))}>Remover foto</Button>}
          </div>
          <p className='text-xs text-muted-foreground'>PNG, JPG ou WEBP · até 600 KB.</p>
        </div>
      </div>

      <label className='grid gap-2'>
        <span className='text-sm font-medium'><LocalizedText text='Nome' /></span>
        <Input value={profile.displayName} disabled={loading} maxLength={100} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} />
      </label>
      <label className='grid gap-2'>
        <span className='text-sm font-medium'><LocalizedText text='Nome de usuário' /></span>
        <Input value={profile.username} disabled readOnly />
        <span className='text-xs text-muted-foreground'>Usado para entrar no painel.</span>
      </label>
      <label className='grid gap-2'>
        <span className='text-sm font-medium'><LocalizedText text='E-mail' /></span>
        <Input value={profile.email} disabled readOnly />
      </label>
      <Button type='button' disabled={loading || saving || profile.displayName.trim().length < 2} onClick={() => void save()}>
        {saving ? 'Salvando…' : 'Salvar perfil'}
      </Button>
    </div>
  )
}
