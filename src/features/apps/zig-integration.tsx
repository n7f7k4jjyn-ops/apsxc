import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ZigSettings = {
  baseUrl: string
  tokenConfigured: boolean
  encryptionKeyConfigured: boolean
  redeId: string
  lojaId: string
  lojaName: string
  missing: string[]
}
type ZigStore = { id: string; name: string }
type Match = { source: string; id: string; name: string; basis?: string }
type Entry = {
  zigId: string | null
  name: string
  phone: { raw: string; kind: string }
  document: { masked: string } | null
  email: string | null
  birthdate: string | null
  kind: string
  matches: Match[]
  suggestedFills: { field: string; value: string }[]
  reasons: string[]
  notes: string[]
}
type Group = { items: Entry[]; total: number; truncated: boolean }
type Preview = {
  generatedAt: string
  warnings: string[]
  assumptions: string[]
  events: { id: string; name: string; beginAt: string; inRequestedPeriod: boolean }[]
  totals: { checkins: number; checkinPages: number; buyers: number; zigPeople: number; unconfirmed: number; otherEventOnly: number }
  summary: { linked: number; created: number; divergent: number; tables: number; divergenceReasons: Record<string, number>; fillableFields: Record<string, number> }
  plan: Plan
  groups: { linked: Group; created: Group; divergent: Group; tables: Group; unconfirmed: { items: Unconfirmed[]; total: number; truncated: boolean } }
}
type Unconfirmed = { zigId: string | null; name: string; phone: { raw: string }; reason: string; ambiguousCandidates: string[]; outsideRecords: number; ambiguousRecords: number }
type Plan = { updates: number; creates: number; kept: number; registrationOnly: number; skipped: number; pending: number; fills: Record<string, number> }
type Report = { backup: string; updated: number; created: number; kept: number; registrationOnly: number; skipped: number; pendingAdded: number; pendingRefreshed: number; pendingAlreadyDecided: number }
type PendingItem = {
  key: string
  zigId: string | null
  name: string
  phone: { raw: string }
  documentMasked: string | null
  email: string | null
  birthdate: string | null
  reasons: string[]
  matches: { source: string; id: string; name: string }[]
  status: 'open' | 'linked' | 'created' | 'ignored'
}

const missingLabels: Record<string, string> = { token: 'token de integração', rede: 'identificador da rede', loja: 'loja Verdant' }
const reasonLabels: Record<string, string> = {
  shared_phone: 'Telefone compartilhado',
  multiple_matches: 'Várias correspondências',
  document_conflict: 'Documentos conflitantes',
  phone_name_mismatch: 'Mesmo telefone, nome diferente',
  document_name_mismatch: 'Mesmo documento, nome diferente',
  possible_phone_variant: 'Possível variação do telefone (9º dígito)',
  name_only: 'Só o nome coincide',
  uncertain_kind: 'Dados insuficientes (pessoa ou comanda?)',
  zig_duplicate_document: 'Mesmo documento em vários cadastros Zig',
  table_tab: 'Comanda de mesa',
  zig_possible_duplicate: 'Possível duplicidade dentro da própria Zig (mesmo telefone e nome compatível)',
}

async function api<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/zig/${route}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  const result = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação com a Zig.')
  return result
}

function EntryList({ title, group, hint }: { title: string; group: Group; hint?: string }) {
  return (
    <details className='rounded-md border p-3'>
      <summary className='cursor-pointer text-sm font-medium'>{title} ({group.total})</summary>
      {hint && <p className='pt-2 text-xs text-muted-foreground'>{hint}</p>}
      <ul className='max-h-96 space-y-2 overflow-auto pt-3 text-xs'>
        {group.items.map((entry, index) => (
          <li key={`${entry.zigId ?? 'x'}-${index}`} className='rounded border p-2'>
            <p className='font-medium'>{entry.name || '(sem nome)'} <span className='font-normal text-muted-foreground'>· ID Zig {entry.zigId ?? '—'} · {entry.phone.raw || 'sem telefone'}{entry.document ? ` · doc ${entry.document.masked}` : ''}</span></p>
            {entry.reasons.length > 0 && <p className='text-amber-700 dark:text-amber-300'>{entry.reasons.map((reason) => reasonLabels[reason] ?? reason).join(', ')}</p>}
            {entry.matches.map((match) => <p key={`${match.source}-${match.id}`}>↳ {match.source === 'customer' ? 'Cliente' : 'Lista'}: {match.name || match.id}{match.basis ? ` (${match.basis})` : ''}</p>)}
            {entry.suggestedFills.length > 0 && <p>Poderia preencher: {entry.suggestedFills.map((fill) => `${fill.field} = ${fill.value}`).join('; ')}</p>}
            {entry.notes.map((note) => <p key={note} className='text-muted-foreground'>{note}</p>)}
          </li>
        ))}
      </ul>
      {group.truncated && <p className='pt-2 text-xs text-muted-foreground'>Exibindo os primeiros {group.items.length} de {group.total}.</p>}
    </details>
  )
}

export function ZigIntegration() {
  const [settings, setSettings] = useState<ZigSettings | null>(null)
  const [loadError, setLoadError] = useState('')
  const [token, setToken] = useState('')
  const [clearToken, setClearToken] = useState(false)
  const [redeId, setRedeId] = useState('')
  const [stores, setStores] = useState<ZigStore[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [dtinicio, setDtinicio] = useState('')
  const [dtfim, setDtfim] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [pending, setPending] = useState<PendingItem[]>([])

  useEffect(() => {
    let active = true
    api<{ settings: ZigSettings }>('config')
      .then((result) => {
        if (!active) return
        setSettings(result.settings)
        setRedeId(result.settings.redeId)
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar a configuração da Zig.')
      })
    api<{ items: PendingItem[] }>('pending')
      .then((result) => { if (active) setPending(result.items) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  async function run<T>(name: string, action: () => Promise<T>) {
    setBusy(name)
    setMessage(null)
    try {
      return await action()
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Falha ao consultar a Zig.' })
      return null
    } finally {
      setBusy('')
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await run('save', () => api<{ settings: ZigSettings }>('config', { method: 'PUT', body: JSON.stringify({ redeId, token, clearToken }) }))
    if (!result) return
    setSettings(result.settings)
    setToken('')
    setClearToken(false)
    toast.success('Configuração da Zig salva.')
  }

  async function loadStores() {
    const result = await run('stores', () => api<{ stores: ZigStore[] }>('stores'))
    if (result) setStores(result.stores)
  }

  async function chooseStore(id: string) {
    const store = stores.find((item) => item.id === id)
    const result = await run('store', () => api<{ settings: ZigSettings }>('config', { method: 'PUT', body: JSON.stringify({ lojaId: id, lojaName: store?.name ?? '' }) }))
    if (result) setSettings(result.settings)
  }

  async function testConnection() {
    const result = await run('test', () => api<{ message: string }>('test', { method: 'POST' }))
    if (result) setMessage({ ok: true, text: result.message })
  }

  async function runPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPreview(null)
    setReport(null)
    const result = await run('preview', () => api<{ preview: Preview }>('preview', { method: 'POST', body: JSON.stringify({ dtinicio, dtfim }) }))
    if (result) setPreview(result.preview)
  }

  async function applyPreview() {
    if (!preview) return
    const { plan } = preview
    const warnings = preview.warnings.length ? `\n\nAtenção:\n- ${preview.warnings.join('\n- ')}` : ''
    const confirmed = window.confirm(
      `Gravar agora?\n\n• ${plan.creates} clientes novos serão criados\n• ${plan.updates} clientes existentes receberão o vínculo Zig e campos vazios\n• ${plan.pending} divergências irão para a fila de Pendências (nada é gravado nelas)\n• Nada é apagado nem sobrescrito. Um backup é gerado antes.${warnings}`,
    )
    if (!confirmed) return
    const result = await run('apply', () => api<{ report: Report }>('apply', { method: 'POST', body: JSON.stringify({ dtinicio, dtfim, confirm: true, expected: { updates: plan.updates, creates: plan.creates } }) }))
    if (!result) return
    setReport(result.report)
    setPreview(null)
    toast.success('Dados da Zig gravados.')
    const refreshed = await run('pending', () => api<{ items: PendingItem[] }>('pending'))
    if (refreshed) setPending(refreshed.items)
  }

  async function resolvePendingItem(key: string, action: 'link' | 'create' | 'ignore', customerId?: string) {
    const result = await run('resolve', () => api<{ status: string }>('pending/resolve', { method: 'POST', body: JSON.stringify({ key, action, customerId }) }))
    if (!result) return
    setPending((items) => items.map((item) => item.key === key ? { ...item, status: result.status as PendingItem['status'] } : item))
    toast.success('Pendência resolvida.')
  }

  if (loadError) return <p role='alert' className='text-sm text-destructive'>{loadError}</p>
  if (!settings) return <p className='text-sm text-muted-foreground'>Carregando configuração da Zig…</p>
  const ready = settings.missing.length === 0

  return (
    <div className='space-y-4'>
      <p className='text-sm text-muted-foreground'>Apenas consultas (GET) à API da Zig. Primeiro gere a prévia (nada é gravado); depois, se estiver correta, use Gravar: cria clientes novos, vincula o ID Zig e preenche só campos vazios. Nada é apagado ou sobrescrito. O Financeiro só é alimentado pela seção “Conversão das listas e caixa”, com confirmação e backup. Endereço fixo: {settings.baseUrl}</p>
      {settings.missing.length > 0 && <p role='status' className='rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'>Falta configurar: {settings.missing.map((item) => missingLabels[item] ?? item).join(', ')}.</p>}
      {!settings.encryptionKeyConfigured && <p role='alert' className='text-sm text-destructive'>VERDANT_INTEGRATION_ENCRYPTION_KEY não está configurada no servidor; o token não poderá ser salvo.</p>}
      <form onSubmit={save} className='grid gap-4 md:grid-cols-2'>
        <label className='space-y-1.5 text-sm font-medium'>Token de integração Zig
          <Input value={token} onChange={(event) => setToken(event.target.value)} type='password' autoComplete='new-password' maxLength={2048} placeholder={settings.tokenConfigured ? 'Já configurado; deixe vazio para manter' : 'Cole o token'} />
          <span className='flex items-center gap-2 text-xs font-normal text-muted-foreground'><input type='checkbox' checked={clearToken} onChange={(event) => setClearToken(event.target.checked)} className='size-4 accent-emerald-700' />Remover token salvo</span>
        </label>
        <label className='space-y-1.5 text-sm font-medium'>Identificador da rede
          <Input value={redeId} onChange={(event) => setRedeId(event.target.value)} maxLength={64} placeholder='Informado pela Zig' />
        </label>
        <div className='flex flex-wrap gap-2 md:col-span-2'>
          <Button type='submit' disabled={busy !== ''}>{busy === 'save' ? 'Salvando…' : 'Salvar'}</Button>
          <Button type='button' variant='outline' disabled={busy !== '' || !settings.tokenConfigured || !settings.redeId} onClick={() => void testConnection()}>{busy === 'test' ? 'Testando…' : 'Testar conexão'}</Button>
          <Button type='button' variant='outline' disabled={busy !== '' || !settings.tokenConfigured || !settings.redeId} onClick={() => void loadStores()}>{busy === 'stores' ? 'Consultando…' : 'Listar lojas da rede'}</Button>
        </div>
      </form>
      {(stores.length > 0 || settings.lojaId) && (
        <label className='block space-y-1.5 text-sm font-medium'>Loja Verdant
          <select className='h-9 w-full rounded-md border bg-background px-2 text-sm' value={settings.lojaId} disabled={busy !== ''} onChange={(event) => void chooseStore(event.target.value)}>
            <option value=''>Selecione…</option>
            {settings.lojaId && !stores.some((store) => store.id === settings.lojaId) && <option value={settings.lojaId}>{settings.lojaName || settings.lojaId}</option>}
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name} ({store.id})</option>)}
          </select>
        </label>
      )}
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-sm text-emerald-700 dark:text-emerald-300' : 'text-sm text-destructive'}>{message.text}</p>}

      <form onSubmit={runPreview} className='space-y-3 rounded-md border p-3'>
        <h3 className='text-sm font-semibold'>Prévia do cruzamento</h3>
        <p className='text-xs text-muted-foreground'>Use as datas de um evento já encerrado (até 14 dias, no máximo 5 eventos). A consulta pode levar alguns minutos.</p>
        <div className='flex flex-wrap items-end gap-3'>
          <label className='space-y-1 text-sm font-medium'>Data inicial<Input type='date' value={dtinicio} onChange={(event) => setDtinicio(event.target.value)} required /></label>
          <label className='space-y-1 text-sm font-medium'>Data final<Input type='date' value={dtfim} onChange={(event) => setDtfim(event.target.value)} required /></label>
          <Button type='submit' disabled={busy !== '' || !ready}>{busy === 'preview' ? 'Consultando a Zig…' : 'Gerar prévia'}</Button>
        </div>
      </form>

      {report && (
        <p role='status' className='rounded-md border border-emerald-300/60 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'>
          Gravado: {report.created} clientes novos, {report.updated} atualizados, {report.kept} mantidos; {report.pendingAdded} novas pendências{report.skipped ? `; ${report.skipped} ignorados por conflito` : ''}. Backup: {report.backup}.
        </p>
      )}

      {pending.some((item) => item.status === 'open') && (
        <details open className='rounded-md border p-3'>
          <summary className='cursor-pointer text-sm font-medium'>Pendências de divergência ({pending.filter((item) => item.status === 'open').length})</summary>
          <p className='pt-2 text-xs text-muted-foreground'>Nada foi gravado para estas pessoas. Escolha vincular a um cliente sugerido, criar como novo ou ignorar. A decisão fica salva e não reaparece.</p>
          <ul className='max-h-96 space-y-2 overflow-auto pt-3 text-xs'>
            {pending.filter((item) => item.status === 'open').map((item) => (
              <li key={item.key} className='space-y-1 rounded border p-2'>
                <p className='font-medium'>{item.name || '(sem nome)'} <span className='font-normal text-muted-foreground'>· ID Zig {item.zigId ?? '—'} · {item.phone.raw || 'sem telefone'}{item.documentMasked ? ` · doc ${item.documentMasked}` : ''}</span></p>
                <p className='text-amber-700 dark:text-amber-300'>{item.reasons.map((reason) => reasonLabels[reason] ?? reason).join(', ')}</p>
                <div className='flex flex-wrap gap-2'>
                  {item.matches.filter((match) => match.source === 'customer').map((match) => (
                    <Button key={match.id} type='button' size='sm' variant='outline' disabled={busy !== ''} onClick={() => void resolvePendingItem(item.key, 'link', match.id)}>Vincular a {match.name || match.id}</Button>
                  ))}
                  <Button type='button' size='sm' variant='outline' disabled={busy !== ''} onClick={() => void resolvePendingItem(item.key, 'create')}>Criar como novo</Button>
                  <Button type='button' size='sm' variant='ghost' disabled={busy !== ''} onClick={() => void resolvePendingItem(item.key, 'ignore')}>Ignorar</Button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {preview && (
        <div className='space-y-3'>
          <p className='text-sm'>Gerada em {new Date(preview.generatedAt).toLocaleString('pt-BR')} · {preview.events.filter((event) => event.inRequestedPeriod).map((event) => event.name).join(', ')} · {preview.totals.checkins} check-ins ({preview.totals.checkinPages} páginas), {preview.totals.buyers} compradores, {preview.totals.zigPeople} pessoas Zig. Nenhum dado foi gravado.</p>
          {preview.warnings.map((warning) => <p key={warning} role='status' className='text-sm text-amber-700 dark:text-amber-300'>{warning}</p>)}
          <div className='grid gap-2 text-sm sm:grid-cols-4'>
            <div className='rounded border p-2'>Vínculo encontrado<br /><strong>{preview.summary.linked}</strong></div>
            <div className='rounded border p-2'>Cliente novo<br /><strong>{preview.summary.created}</strong></div>
            <div className='rounded border p-2'>Divergência<br /><strong>{preview.summary.divergent}</strong></div>
            <div className='rounded border p-2'>Comandas de mesa<br /><strong>{preview.summary.tables}</strong></div>
          </div>
          <p className='text-xs text-muted-foreground'>Campos vazios que a Zig poderia preencher: {Object.entries(preview.summary.fillableFields).map(([field, count]) => `${field} (${count})`).join(', ') || 'nenhum'}.</p>
          <div className='space-y-2 rounded-md border border-emerald-300/60 bg-emerald-50/50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/20'>
            <p className='font-medium'>O que Gravar fará</p>
            <ul className='list-disc pl-5 text-xs'>
              <li>Criar {preview.plan.creates} clientes novos.</li>
              <li>Vincular e completar {preview.plan.updates} clientes existentes (somente campos vazios{Object.keys(preview.plan.fills).length ? `: ${Object.entries(preview.plan.fills).map(([field, count]) => `${field} ${count}`).join(', ')}` : ''}).</li>
              <li>Enviar {preview.plan.pending} divergências para Pendências, sem gravar nelas.</li>
              <li>Manter {preview.plan.kept} já atualizados{preview.plan.registrationOnly ? `, ${preview.plan.registrationOnly} só presentes nas listas (sem cliente para completar)` : ''}{preview.plan.skipped ? `, ${preview.plan.skipped} ignorados por conflito` : ''}.</li>
            </ul>
            <Button type='button' disabled={busy !== ''} onClick={() => void applyPreview()}>{busy === 'apply' ? 'Gravando…' : 'Gravar'}</Button>
          </div>
          <EntryList title='Vínculo encontrado' group={preview.groups.linked} hint='Telefone e nome compatíveis (ou documento e nome). Nenhum dado existente seria sobrescrito.' />
          <EntryList title='Cliente novo' group={preview.groups.created} />
          <EntryList title='Divergência — conferir manualmente' group={preview.groups.divergent} />
          <EntryList title='Comandas de mesa' group={preview.groups.tables} />
          <details className='rounded-md border p-3'>
            <summary className='cursor-pointer text-sm font-medium'>Presença não confirmada ({preview.groups.unconfirmed.total})</summary>
            <p className='pt-2 text-xs text-muted-foreground'>Registros fora da janela de qualquer evento ou compatíveis com mais de um evento. Não contam como presença e não entram no cruzamento. {preview.totals.otherEventOnly > 0 ? `${preview.totals.otherEventOnly} pessoa(s) de eventos vizinhos foram ignoradas.` : ''}</p>
            <ul className='max-h-96 space-y-2 overflow-auto pt-3 text-xs'>
              {preview.groups.unconfirmed.items.map((item, index) => (
                <li key={`${item.zigId ?? 'x'}-${index}`} className='rounded border p-2'>
                  <p className='font-medium'>{item.name || '(sem nome)'} <span className='font-normal text-muted-foreground'>· ID Zig {item.zigId ?? '—'} · {item.phone.raw || 'sem telefone'}</span></p>
                  <p className='text-amber-700 dark:text-amber-300'>{item.reason === 'ambiguous_events' ? `Compatível com mais de um evento (${item.ambiguousCandidates.join(', ')})` : 'Fora da janela de qualquer evento'}</p>
                </li>
              ))}
            </ul>
          </details>
          <ul className='list-disc space-y-1 pl-5 text-xs text-muted-foreground'>{preview.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
