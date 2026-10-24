import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { SlidersHorizontal, ArrowUpAZ, ArrowDownAZ } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { useAuthStore } from '@/stores/auth-store'
import { apps } from './data/apps'
import { ZigIntegration } from './zig-integration'

const route = getRouteApi('/_authenticated/apps/')

type AppType = 'all' | 'connected' | 'notConnected'

const appText = new Map<AppType, string>([
  ['all', 'Todos os apps'],
  ['connected', 'Conectados'],
  ['notConnected', 'Não conectados'],
])

type IntegrationSettings = {
  metaPixelId: string
  whatsappTarget: string
  gmailTarget: string
  gmailClientId: string
  telegramTarget: string
  credentials: { gmailClientSecretConfigured: boolean; telegramBotTokenConfigured: boolean }
}
const emptySettings: IntegrationSettings = {
  metaPixelId: '',
  whatsappTarget: '',
  gmailTarget: '',
  gmailClientId: '',
  telegramTarget: '',
  credentials: { gmailClientSecretConfigured: false, telegramBotTokenConfigured: false },
}
const shortcutAppNames = new Set(['WhatsApp', 'Gmail', 'Telegram'])

export function Apps() {
  const { translate } = useLanguage()
  const isAdmin = useAuthStore((state) => state.auth.user?.role.includes('admin') ?? false)
  const {
    filter = '',
    type = 'all',
    sort: initSort = 'asc',
  } = route.useSearch()
  const navigate = route.useNavigate()

  const [sort, setSort] = useState(initSort)
  const [appType, setAppType] = useState(type)
  const [searchTerm, setSearchTerm] = useState(filter)
  const [settings, setSettings] = useState<IntegrationSettings>(emptySettings)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [gmailSecret, setGmailSecret] = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [clearGmailSecret, setClearGmailSecret] = useState(false)
  const [clearTelegramToken, setClearTelegramToken] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (isAdmin) {
          const response = await fetch('/api/admin/integrations', { credentials: 'same-origin', cache: 'no-store' })
          const result = await response.json() as { settings?: IntegrationSettings; error?: string }
          if (!response.ok || !result.settings) throw new Error(result.error || 'Não foi possível carregar as configurações.')
          if (alive) setSettings(result.settings)
        }
        if (alive) setSettingsLoaded(true)
      } catch (error) {
        if (alive) setSettingsError(error instanceof Error ? error.message : 'Não foi possível carregar as configurações.')
      } finally {
        if (alive) setSettingsLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [isAdmin])

  async function saveIntegrationSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSettingsError('')
    setSettingsSaving(true)
    try {
      const response = await fetch('/api/admin/integrations', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaPixelId: settings.metaPixelId,
          whatsappTarget: settings.whatsappTarget,
          gmailTarget: settings.gmailTarget,
          gmailClientId: settings.gmailClientId,
          gmailClientSecret: gmailSecret,
          clearGmailClientSecret: clearGmailSecret,
          telegramTarget: settings.telegramTarget,
          telegramBotToken: telegramToken,
          clearTelegramBotToken: clearTelegramToken,
        }),
      })
      const result = await response.json() as { settings?: IntegrationSettings; error?: string }
      if (!response.ok || !result.settings) throw new Error(result.error || 'Não foi possível salvar as configurações.')
      setSettings(result.settings)
      setGmailSecret('')
      setTelegramToken('')
      setClearGmailSecret(false)
      setClearTelegramToken(false)
      toast.success(translate('Configurações salvas.'), { duration: 10000 })
    } catch (error) {
      setSettingsError(error instanceof Error ? translate(error.message) : translate('Não foi possível salvar as configurações.'))
    } finally {
      setSettingsSaving(false)
    }
  }

  const filteredApps = apps
    .filter((app) => shortcutAppNames.has(app.name))
    .sort((a, b) =>
      sort === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    )
    .filter((app) =>
      appType === 'connected'
        ? app.connected
        : appType === 'notConnected'
          ? !app.connected
          : true
    )
    .filter((app) => app.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    navigate({
      search: (prev) => ({
        ...prev,
        filter: e.target.value || undefined,
      }),
    })
  }

  const handleTypeChange = (value: AppType) => {
    setAppType(value)
    navigate({
      search: (prev) => ({
        ...prev,
        type: value === 'all' ? undefined : value,
      }),
    })
  }

  const handleSortChange = (sort: 'asc' | 'desc') => {
    setSort(sort)
    navigate({ search: (prev) => ({ ...prev, sort }) })
  }

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <div className='min-w-0 flex-1'><Search /></div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <ThemeSwitch />
          <div className='hidden sm:block'><ConfigDrawer /></div>
          <ProfileDropdown />
        </div>
      </Header>

      {/* ===== Content ===== */}
      <Main fixed>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>{<LocalizedText text="Integrações de apps" leadingSpace trailingSpace />}</h1>
          <p className='text-muted-foreground'>{<LocalizedText text="Catálogo de serviços. A conexão OAuth/API ainda precisa ser configurada para cada serviço." leadingSpace trailingSpace />}</p>
        </div>
        <div role='status' className='rounded-lg border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'>{<LocalizedText text="Esses serviços estão em implantação: as configurações podem ser salvas por administradores. Somente o Meta Pixel está ativo nesta versão; os demais atalhos ainda não." />}</div>
        {isAdmin && <details id='integracoes' open className='rounded-lg border p-4'>
          <summary className='cursor-pointer font-semibold'>{<LocalizedText text='Configurações administrativas de integrações' />}</summary>
          {settingsLoading ? <p className='pt-4 text-sm text-muted-foreground'>{<LocalizedText text='Carregando configurações…' />}</p> : !settingsLoaded ? <p role='alert' className='pt-4 text-sm text-destructive'>{settingsError || translate('Não foi possível carregar as configurações.')}</p> : <form onSubmit={saveIntegrationSettings} className='mt-4 space-y-4'>
            <p className='text-sm text-muted-foreground'>{<LocalizedText text='As configurações ficam no servidor. Segredos nunca são devolvidos à interface; campos vazios preservam credenciais salvas. O Meta Pixel é o único item ativo: ao salvar o ID, os formulários públicos passam a registrar visualização e envio.' />}</p>
            <div className='grid gap-4 md:grid-cols-2'>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='ID do Meta Pixel' />}<Input value={settings.metaPixelId} onChange={(event) => setSettings((current) => ({ ...current, metaPixelId: event.target.value }))} inputMode='numeric' maxLength={30} placeholder='Somente números' /><span className='block text-xs font-normal text-muted-foreground'><LocalizedText text='Ativo em todos os formulários públicos: PageView ao abrir, Lead após inscrição nas listas ou candidatura e TeamRegistrationUpdated após atualização da equipe. Não inclui os dados preenchidos nos eventos. Deixe vazio para desativar.' /></span></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='WhatsApp: telefone ou link wa.me' />}<Input value={settings.whatsappTarget} onChange={(event) => setSettings((current) => ({ ...current, whatsappTarget: event.target.value }))} maxLength={254} placeholder='+55 41 99999-9999 ou https://wa.me/...' /></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='Gmail: e-mail de contato' />}<Input value={settings.gmailTarget} onChange={(event) => setSettings((current) => ({ ...current, gmailTarget: event.target.value }))} type='email' maxLength={254} placeholder='contato@exemplo.com' /></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='Gmail OAuth Client ID (opcional)' />}<Input value={settings.gmailClientId} onChange={(event) => setSettings((current) => ({ ...current, gmailClientId: event.target.value }))} maxLength={512} /></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='Gmail OAuth Client Secret (opcional)' />}<Input value={gmailSecret} onChange={(event) => setGmailSecret(event.target.value)} type='password' autoComplete='new-password' maxLength={2048} placeholder={settings.credentials.gmailClientSecretConfigured ? translate('Já configurado; deixe vazio para manter') : translate('Configure a chave de criptografia no servidor')} /><span className='flex items-center gap-2 text-xs font-normal text-muted-foreground'><input type='checkbox' checked={clearGmailSecret} onChange={(event) => setClearGmailSecret(event.target.checked)} className='size-4 accent-emerald-700' /><LocalizedText text='Remover segredo salvo' /></span></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='Telegram: @usuário ou link t.me' />}<Input value={settings.telegramTarget} onChange={(event) => setSettings((current) => ({ ...current, telegramTarget: event.target.value }))} maxLength={254} placeholder='@usuario' /></label>
              <label className='space-y-1.5 text-sm font-medium'>{<LocalizedText text='Telegram Bot Token (opcional)' />}<Input value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} type='password' autoComplete='new-password' maxLength={1024} placeholder={settings.credentials.telegramBotTokenConfigured ? translate('Já configurado; deixe vazio para manter') : translate('Configure a chave de criptografia no servidor')} /><span className='flex items-center gap-2 text-xs font-normal text-muted-foreground'><input type='checkbox' checked={clearTelegramToken} onChange={(event) => setClearTelegramToken(event.target.checked)} className='size-4 accent-emerald-700' /><LocalizedText text='Remover segredo salvo' /></span></label>
            </div>
            <p className='text-xs text-muted-foreground'><LocalizedText text='Gmail e Telegram permanecem inativos até que os fluxos de autorização sejam implementados. Segredos informados são armazenados criptografados e não ativam sincronização nem envio de mensagens.' /></p>
            {settingsError && <p role='alert' className='text-sm text-destructive'>{settingsError}</p>}
            <Button type='submit' disabled={settingsSaving}>{settingsSaving ? translate('Salvando…') : translate('Salvar configurações')}</Button>
          </form>}
        </details>}
        {isAdmin && <details id='zig' className='rounded-lg border p-4'>
          <summary className='cursor-pointer font-semibold'>Zig: conexão e prévia de clientes (somente consulta)</summary>
          <div className='mt-4'><ZigIntegration /></div>
        </details>}
        {!isAdmin && <p role='status' className='text-xs text-muted-foreground'><LocalizedText text='A configuração de integrações está disponível somente para administradores.' /></p>}
        <div className='my-4 flex items-end justify-between sm:my-0 sm:items-center'>
          <div className='flex flex-col gap-4 sm:my-4 sm:flex-row'>
            <Input
              placeholder={translate('Filtrar apps...')}
              className='h-9 w-40 lg:w-62.5'
              value={searchTerm}
              onChange={handleSearch}
            />
            <Select value={appType} onValueChange={handleTypeChange}>
              <SelectTrigger className='w-36'>
                <SelectValue>{translate(appText.get(appType) ?? 'Todos os apps')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{<LocalizedText text="Todos os apps" />}</SelectItem>
                <SelectItem value='connected'>{<LocalizedText text="Conectados" />}</SelectItem>
                <SelectItem value='notConnected'>{<LocalizedText text="Não conectados" />}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={sort} onValueChange={handleSortChange}>
            <SelectTrigger className='w-16'>
              <SelectValue>
                <SlidersHorizontal size={18} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent align='end'>
              <SelectItem value='asc'>
                <div className='flex items-center gap-4'>
                  <ArrowUpAZ size={16} />
                  <span>{<LocalizedText text="Ordem crescente" />}</span>
                </div>
              </SelectItem>
              <SelectItem value='desc'>
                <div className='flex items-center gap-4'>
                  <ArrowDownAZ size={16} />
                  <span>{<LocalizedText text="Ordem decrescente" />}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Separator className='shadow-sm' />
        <ul className='faded-bottom no-scrollbar grid gap-4 overflow-auto pt-4 pb-16 md:grid-cols-2 lg:grid-cols-3'>
          {filteredApps.map((app) => (
            <li
              key={app.name}
              className='rounded-lg border p-4 hover:shadow-md'
            >
              <div className='mb-8 flex items-center justify-between'>
                <div
                  className={`flex size-10 items-center justify-center rounded-lg bg-muted p-2`}
                >
                  {app.logo}
                </div>
                <span className='rounded-full border px-2.5 py-1 text-xs text-muted-foreground'><LocalizedText text='Em implantação' /></span>
              </div>
              <div>
                <h2 className='mb-1 font-semibold'>{app.name}</h2>
                <p className='line-clamp-2 text-gray-500'><LocalizedText text={app.name === 'WhatsApp' ? 'O destino pode ser configurado pelo administrador; o atalho não fica ativo até a implantação.' : 'O destino e as credenciais podem ser configurados pelo administrador; OAuth, sincronização e envio não estão ativos.'} /></p>
              </div>
            </li>
          ))}
        </ul>
      </Main>
    </>
  )
}
