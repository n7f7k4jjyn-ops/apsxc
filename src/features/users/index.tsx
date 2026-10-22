import { LocalizedText, useLanguage } from '@/context/language-provider'
import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Pencil, ShieldCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Input } from '@/components/ui/input'
type UserRole = 'admin' | 'operator' | 'viewer'
type TeamMember = { username: string; displayName: string; email: string; role: UserRole; active: boolean; managedByEnvironment?: boolean }

export function Users() {
  const { language, translate } = useLanguage()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingUser, setEditingUser] = useState<TeamMember | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/team', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { users?: TeamMember[]; error?: string }
        if (!response.ok) throw new Error(translate(result.error || 'Não foi possível carregar a equipe.'))
        return result.users ?? []
      })
      .then((users) => { if (alive) setMembers(users) })
      .catch((reason) => { if (alive) setError(translate(reason instanceof Error ? reason.message : 'Não foi possível carregar a equipe.')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [translate])

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setNotice('')
    const form = event.currentTarget
    const fields = new FormData(form)
    const password = String(fields.get('password') || '')
    const confirmation = String(fields.get('confirmPassword') || '')
    if (password !== confirmation) {
      setFormError(translate('As senhas não coincidem.'))
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/team', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: fields.get('displayName'),
          username: fields.get('username'),
          email: fields.get('email'),
          password,
          role: fields.get('role'),
        }),
      })
      const result = await response.json() as { user?: TeamMember; error?: string }
      if (!response.ok || !result.user) throw new Error(translate(result.error || 'Não foi possível cadastrar o usuário.'))
      setMembers((current) => [...current, result.user!].sort((a, b) => a.displayName.localeCompare(b.displayName, language === 'en' ? 'en' : 'pt-BR')))
      form.reset()
      setNotice(language === 'en'
        ? `Access for ${result.user.displayName} is ready. They can now sign in with their username or email and the password they set.`
        : `Acesso de ${result.user.displayName} criado. A pessoa já pode entrar com o nome de usuário ou e-mail e a senha cadastrada.`)
      setFormOpen(false)
    } catch (reason) {
      setFormError(translate(reason instanceof Error ? reason.message : 'Não foi possível cadastrar o usuário.'))
    } finally {
      setSaving(false)
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingUser) return
    setEditError('')
    const fields = new FormData(event.currentTarget)
    const password = String(fields.get('password') || '')
    setEditSaving(true)
    try {
      const response = await fetch(`/api/team/${encodeURIComponent(editingUser.username)}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: fields.get('displayName'), email: fields.get('email'), active: fields.has('active'), password, role: fields.get('role') }),
      })
      const result = await response.json() as { user?: TeamMember; error?: string }
      if (!response.ok || !result.user) throw new Error(translate(result.error || 'Não foi possível atualizar o usuário.'))
      setMembers((current) => current.map((member) => member.username === result.user!.username ? result.user! : member).sort((a, b) => a.displayName.localeCompare(b.displayName, language === 'en' ? 'en' : 'pt-BR')))
      setEditingUser(null)
      setNotice(translate(`Acesso de ${result.user.displayName} atualizado.`))
    } catch (reason) {
      setEditError(translate(reason instanceof Error ? reason.message : 'Não foi possível atualizar o usuário.'))
    } finally {
      setEditSaving(false)
    }
  }

  return <>
    <Header fixed>
      <div className='min-w-0 flex-1'><Search /></div>
      <div className='flex shrink-0 items-center gap-0.5'><ThemeSwitch /><ProfileDropdown /></div>
    </Header>
    <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div><h1 className='text-2xl font-bold tracking-tight'>{<LocalizedText text="Equipe" />}</h1><p className='text-muted-foreground'>{<LocalizedText text="Gerencie os acessos individuais à Central Verdant." />}</p></div>
      {notice && <p role='status' className='flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200'><CheckCircle2 size={17} />{notice}</p>}
      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3'>
          <div><CardTitle>{<LocalizedText text="Usuários autorizados" />}</CardTitle><CardDescription>{<LocalizedText text="As senhas não aparecem na lista e ficam armazenadas como hash no servidor." />}</CardDescription></div>
          <Button type='button' onClick={() => { setFormOpen((open) => !open); setFormError(''); setNotice('') }}><UserPlus size={16} />{formOpen ? translate('Cancelar') : translate('Cadastrar usuário')}</Button>
        </CardHeader>
        {formOpen && <CardContent className='border-t pt-5'>
          <form onSubmit={createUser} className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text="Nome completo" />}<Input name='displayName' required minLength={2} maxLength={100} autoComplete='name' placeholder={translate('Nome para identificação no painel')} /></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text="Nome de usuário" />}<Input name='username' required minLength={3} maxLength={32} pattern='[a-zA-Z0-9._-]{3,32}' autoComplete='username' placeholder={translate('ex.: maria.silva')} /><span className='block text-xs font-normal text-muted-foreground'>{<LocalizedText text="Use letras sem acento, números, ponto, hífen ou sublinhado." />}</span></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text="E-mail" />}<Input name='email' type='email' required maxLength={254} autoComplete='email' placeholder={translate('pessoa@dominio.com')} /><span className='block text-xs font-normal text-muted-foreground'>{<LocalizedText text="Aceita endereço de qualquer domínio." />}</span></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='Perfil de acesso' />}<select name='role' defaultValue='operator' className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'><option value='operator'>{<LocalizedText text='Operação' />}</option><option value='viewer'>{<LocalizedText text='Consulta' />}</option><option value='admin'>{<LocalizedText text='Administrador' />}</option></select><span className='block text-xs font-normal text-muted-foreground'>{<LocalizedText text='Novas contas começam com acesso de Operação.' />}</span></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text="Senha" />}<Input name='password' type='password' required minLength={12} maxLength={128} autoComplete='new-password' placeholder={translate('Mínimo de 12 caracteres')} /></label>
              <label className='space-y-1.5 text-sm font-medium sm:col-span-2'>{<LocalizedText text="Confirme a senha" />}<Input name='confirmPassword' type='password' required minLength={12} maxLength={128} autoComplete='new-password' placeholder={translate('Digite a mesma senha novamente')} /></label>
            </div>
            {formError && <p role='alert' className='flex items-center gap-2 text-sm text-destructive'><AlertCircle size={16} />{formError}</p>}
            <div className='flex flex-wrap items-center justify-end gap-2'><Button type='button' variant='outline' onClick={() => setFormOpen(false)} disabled={saving}>{<LocalizedText text="Cancelar" />}</Button><Button type='submit' disabled={saving}>{saving ? translate('Cadastrando…') : translate('Cadastrar usuário')}</Button></div>
          </form>
        </CardContent>}
        {editingUser && <CardContent className='border-t pt-5'>
          <form onSubmit={updateUser} className='space-y-4'>
            <div className='flex items-center justify-between gap-3'><div><h2 className='font-semibold'>{<LocalizedText text='Editar acesso' />}: {editingUser.displayName}</h2><p className='text-sm text-muted-foreground'>{editingUser.username}</p></div><Button type='button' variant='outline' size='sm' onClick={() => setEditingUser(null)} disabled={editSaving}>{<LocalizedText text='Cancelar' />}</Button></div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='Nome completo' />}<Input name='displayName' defaultValue={editingUser.displayName} required minLength={2} maxLength={100} /></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='E-mail' />}<Input name='email' type='email' defaultValue={editingUser.email} required maxLength={254} /></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='Perfil de acesso' />}<select name='role' defaultValue={editingUser.role} className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'><option value='admin'>{<LocalizedText text='Administrador' />}</option><option value='operator'>{<LocalizedText text='Operação' />}</option><option value='viewer'>{<LocalizedText text='Consulta' />}</option></select></label>
              <label className='flex items-center gap-2 text-sm font-medium sm:col-span-2'><input name='active' type='checkbox' defaultChecked={editingUser.active} className='size-4 accent-emerald-700' /><span><LocalizedText text='Acesso ativo' /></span></label>
              {!editingUser.managedByEnvironment && <label className='space-y-1.5 text-sm font-medium sm:col-span-2'>{<LocalizedText text='Nova senha (opcional)' />}<Input name='password' type='password' minLength={12} maxLength={128} autoComplete='new-password' placeholder={translate('Deixe vazio para manter a senha atual')} /><span className='block text-xs font-normal text-muted-foreground'>{<LocalizedText text='Se preenchida, a nova senha deve ter pelo menos 12 caracteres.' />}</span></label>}
            </div>
            {editingUser.managedByEnvironment && <p className='text-xs text-muted-foreground'>{<LocalizedText text='Esta conta vem das configurações do servidor. Nome, e-mail e acesso podem ser alterados aqui; a senha continua sendo gerenciada no servidor.' />}</p>}
            {editError && <p role='alert' className='flex items-center gap-2 text-sm text-destructive'><AlertCircle size={16} />{editError}</p>}
            <div className='flex justify-end'><Button type='submit' disabled={editSaving}>{editSaving ? translate('Salvando…') : translate('Salvar alterações')}</Button></div>
          </form>
        </CardContent>}
        <CardContent>
          {loading ? <p className='py-8 text-center text-sm text-muted-foreground'>{<LocalizedText text="Carregando equipe…" />}</p> : error ? <p role='alert' className='flex items-center gap-2 py-4 text-sm text-destructive'><AlertCircle size={16} />{error}</p> : members.length ? <div className='overflow-x-auto max-md:overflow-visible'><table className='w-full min-w-[760px] text-left text-sm max-md:block max-md:min-w-0'><thead className='max-md:hidden'><tr className='border-b text-xs text-muted-foreground'><th className='px-3 py-2'>{<LocalizedText text="Membro" />}</th><th className='px-3 py-2'>{<LocalizedText text="Nome de usuário" />}</th><th className='px-3 py-2'>{<LocalizedText text="E-mail" />}</th><th className='px-3 py-2'>{<LocalizedText text='Perfil de acesso' />}</th><th className='px-3 py-2'>{<LocalizedText text="Acesso" />}</th><th className='px-3 py-2'>{<LocalizedText text="Ações" />}</th></tr></thead><tbody className='max-md:grid max-md:gap-3'>{members.map((member) => <tr key={member.username} className='border-b last:border-0 max-md:grid max-md:rounded-xl max-md:border max-md:bg-card max-md:p-3'><td className='px-3 py-3 font-medium max-md:px-0 max-md:py-1.5 max-md:text-base'>{member.displayName}</td><td className='px-3 py-3 max-md:px-0 max-md:py-1.5'>{member.username}</td><td className='px-3 py-3 max-md:px-0 max-md:py-1.5'>{member.email || '—'}</td><td className='px-3 py-3 max-md:px-0 max-md:py-1.5'><LocalizedText text={member.role === 'admin' ? 'Administrador' : member.role === 'operator' ? 'Operação' : 'Consulta'} /></td><td className='px-3 py-3 max-md:px-0 max-md:py-1.5'><span className={`inline-flex items-center gap-1.5 ${member.active ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}><ShieldCheck size={15} /><LocalizedText text={member.active ? 'Ativo' : 'Inativo'} /></span></td><td className='px-3 py-2 max-md:px-0 max-md:pt-3'><Button type='button' variant='ghost' size='sm' onClick={() => { setEditingUser(member); setEditError(''); setFormOpen(false) }}><Pencil size={14} />{<LocalizedText text='Editar' leadingSpace />}</Button></td></tr>)}</tbody></table></div> : <div className='flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'><ShieldCheck size={18} /><div><b>{<LocalizedText text="Nenhuma conta ativa encontrada." />}</b><p className='mt-1'>{<LocalizedText text="Use “Cadastrar usuário” para criar um acesso. O cadastro fica disponível somente dentro do painel autenticado." />}</p></div></div>}
        </CardContent>
      </Card>
      <p className='text-xs text-muted-foreground'>{<LocalizedText text="Novas contas são salvas no armazenamento do servidor. A equipe poderá entrar com o nome de usuário ou o e-mail, usando a senha definida no cadastro. A lista de responsáveis de tarefas usa as mesmas contas ativas." />}</p>
    </Main>
  </>
}

