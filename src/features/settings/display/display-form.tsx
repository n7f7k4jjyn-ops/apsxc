import { LocalizedText, useLanguage } from '@/context/language-provider'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
const navigationOptions = [
  { id: '/', label: 'Início' },
  { id: '/tasks', label: 'Tarefas' },
  { id: '/apps', label: 'Apps' },
  { id: '/chats', label: 'Conversas' },
  { id: '/users', label: 'Equipe' },
  { id: '/verdant/agenda', label: 'Agenda de eventos' },
  { id: '/verdant/conteudo', label: 'Conteúdo' },
  { id: '/verdant/escalas', label: 'Escalas' },
  { id: '/verdant/financeiro', label: 'Financeiro' },
  { id: '/verdant/cadastros', label: 'Cadastros' },
  { id: '/verdant/formularios', label: 'Formulários' },
  { id: '/verdant/listas', label: 'Listas' },
  { id: '/verdant/respostas', label: 'Respostas' },
  { id: '/verdant/inscricoes', label: 'Clientes' },
  { id: '/verdant/djs', label: 'Cadastro de DJs' },
  { id: '/verdant/influencers', label: 'Cadastro de Influencers' },
  { id: '/verdant/configuracoes', label: 'Configurações Verdant' },
  { id: '/help-center', label: 'Central de ajuda' },
  { id: '/settings', label: 'Configurações da conta' },
  { id: '/settings/account', label: 'Conta' },
  { id: '/settings/appearance', label: 'Aparência' },
  { id: '/settings/notifications', label: 'Notificações' },
  { id: '/settings/display', label: 'Exibição' },
] as const

export function DisplayForm() {
  const { translate } = useLanguage()
  const [selected, setSelected] = useState<string[]>(navigationOptions.map((option) => option.id))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/preferences', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(translate('Não foi possível carregar as preferências da equipe.'))
        return await response.json() as { navigation?: string[] }
      })
      .then((value) => {
        if (alive && value.navigation?.length) setSelected(value.navigation)
      })
      .catch((error) => toast.error(translate(error instanceof Error ? error.message : 'Erro ao carregar preferências.')))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [translate])

  function toggle(id: string, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))
  }

  async function save() {
    if (!selected.length) return toast.error(translate('Mantenha pelo menos uma opção no menu.'))
    setSaving(true)
    try {
      const response = await fetch('/api/preferences', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ navigation: selected }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(translate(result.error || 'Não foi possível salvar as preferências.'))
      window.dispatchEvent(new CustomEvent('verdant:navigation-preferences', { detail: selected }))
      toast.success(translate('Exibição salva para sua conta.'))
    } catch (error) {
      toast.error(translate(error instanceof Error ? error.message : 'Erro ao salvar preferências.'))
    } finally { setSaving(false) }
  }

  return <div className='space-y-5'>
    <div><h3 className='text-base font-medium'>{<LocalizedText text="Navegação do painel" />}</h3><p className='mt-1 text-sm text-muted-foreground'>{<LocalizedText text="Escolha quais áreas quer ver no menu. A preferência fica salva na sua conta e não altera o acesso dos outros membros." />}</p></div>
    <div className='grid gap-3 sm:grid-cols-2'>{navigationOptions.map((option) => <label key={option.id} className='flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm'><Checkbox checked={selected.includes(option.id)} onCheckedChange={(checked) => toggle(option.id, checked === true)} />{translate(option.label)}</label>)}</div>
    <Button type='button' disabled={loading || saving} onClick={() => void save()}>{saving ? translate('Salvando…') : translate('Salvar exibição')}</Button>
  </div>
}
