import { ColumnFilterControl, SortButton } from './list-controls'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { birthdayGuestNames } from './birthday-guests'
import type { Person, VerdantState, Registration } from './data'
import { postTeamRecords, prepareImport } from './team-registrations-panel'
import './registry.css'

type Category = 'clients' | 'djs' | 'influencers' | 'team' | 'candidates'
type RecordRow = {
  id: string
  name: string
  phone?: string
  whatsapp?: string
  email?: string
  roles?: string[]
  availability?: string[]
  experience?: string
  pixKey?: string
  status?: string
  teamId?: string
  source?: string
  sourceSystem?: string
  createdAt?: string
  history?: (Registration & {
    pixKey?: string
    roles?: string[]
    availability?: string[]
  })[]
}
const categories: { id: Category; label: string }[] = [
  { id: 'clients', label: 'Clientes' },
  { id: 'djs', label: 'DJs' },
  { id: 'influencers', label: 'Influencers' },
  { id: 'team', label: 'Equipe' },
  { id: 'candidates', label: 'Candidatos' },
]
const statuses = {
  new: 'Novo',
  reviewing: 'Em avaliação',
  approved: 'Aprovado',
  rejected: 'Não selecionado',
}
const teamStatuses = {pending:'Pendente de avaliação',active:'Ativo',inactive:'Inativo'}
const weekDays = ['Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
const roles = ['Caixa', 'Bar', 'Limpeza', 'Segurança', 'Cozinha', 'Bombeiro']
const date = (value?: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(value))
    : '—'

export function RegistryPage({
  initialCategory = 'clients',
  data,
  renderPeople,
  tools,
}: {
  initialCategory?: Category
  data: VerdantState
  renderPeople: (kind: Person['kind']) => ReactNode
  tools: ReactNode
}) {
  const admin = useAuthStore((state) => state.auth.user?.role.includes('admin'))
  const navigate = useNavigate()
  const searchStr = useRouterState({
    select: (state) => state.location.searchStr,
  })
  const requested = new URLSearchParams(searchStr).get('category')
  const category = categories.some((item) => item.id === requested)
    ? (requested as Category)
    : initialCategory
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const [availability, setAvailability] = useState('')
  const [event, setEvent] = useState(
    () => new URLSearchParams(window.location.search).get('event') || ''
  )
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('name')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{
    rows: RecordRow[]
    total: number
  } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<RecordRow | null>(null)
  const [showTools, setShowTools] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', whatsapp: '', pixKey: '', experience: '' })
  const [editing, setEditing] = useState<RecordRow | null>(null)
  const [editRoles, setEditRoles] = useState<string[]>([])
  const [editDays, setEditDays] = useState<string[]>([])
  const csvInput = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState('')
  async function importTeamCsv(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    setImportMessage('')
    try {
      const records = prepareImport(await file.text())
      if (!records.length) throw new Error('Nenhum cadastro válido foi encontrado na planilha.')
      const { imported, skipped } = await postTeamRecords(records)
      setImportMessage(`${imported} cadastros importados; ${skipped} duplicados ignorados. Chaves Pix ficam pendentes de atualização.`)
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao importar a planilha.')
    } finally {
      setBusy(false)
      if (csvInput.current) csvInput.current.value = ''
    }
  }
  const professional = category === 'djs' || category === 'influencers'
  const permitted = category !== 'team' || admin
  const label = categories.find((item) => item.id === category)!.label
  useEffect(() => {
    if (professional || !permitted) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      setResult(null)
      try {
        const params = new URLSearchParams({
          q: query,
          offset: String(page * 50),
          status: category !== 'clients' ? status : '',
          role: category === 'clients' ? '' : role,
          availability: category === 'clients' ? '' : availability,
          event: category === 'clients' ? event : '',
          sort,
          dir,
        })
        const response = await fetch(`/api/registry/${category}?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await response.json()
        if (!response.ok)
          throw new Error(
            payload.error || 'Não foi possível carregar os cadastros.'
          )
        if (!controller.signal.aborted)
          setResult({
            rows: payload.clients || payload.records,
            total: payload.total,
          })
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Falha ao consultar cadastros.'
          )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 200)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [
    category,
    query,
    status,
    role,
    availability,
    event,
    page,
    sort,
    dir,
    revision,
    professional,
    permitted,
  ])
  function sortHeader(key: string, text: string) {
    const active = sort === key
    return <SortButton label={text} active={active} direction={dir} onClick={() => { setDir(active && dir === 'asc' ? 'desc' : 'asc'); setSort(key); setPage(0) }} />
  }  function choose(value: Category) {
    void navigate({ to: '/verdant/cadastros', search: { category: value } })
    setPage(0)
    setSort('name')
    setDir('asc')
    setQuery('')
    setStatus('')
    setRole('')
    setAvailability('')
    setSelected(null)
    setResult(null)
    setError('')
  }
  async function review(row: RecordRow, next: string, promote = false) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/job-applications/${encodeURIComponent(row.id)}${promote ? '/promote' : ''}`,
        {
          method: promote ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promote ? {} : { status: next }),
        }
      )
      const payload = await response.json()
      if (!response.ok)
        throw new Error(payload.error || 'Não foi possível salvar a avaliação.')
      setSelected((current) =>
        current?.id === row.id
          ? { ...current, ...payload.application }
          : current
      )
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar.')
    } finally {
      setBusy(false)
    }
  }
  async function updateTeamStatus(row: RecordRow, status: string) {
    setBusy(true);setError('')
    try {
      const response = await fetch(`/api/registry/team/${encodeURIComponent(row.id)}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar o status.')
      setSelected(current=>current?.id===row.id ? {...current,...payload.record} : current)
      setRevision(value=>value+1)
    } catch(cause) {setError((cause as Error).message)} finally {setBusy(false)}
  }
  function startCreate() {
    setForm({ name: '', whatsapp: '', pixKey: '', experience: '' })
    setEditRoles([])
    setEditDays([])
    setCreating(true)
  }
  async function saveCreate() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/registry/${category}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, roles: editRoles, availability: editDays }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar o cadastro.')
      setCreating(false)
      setImportMessage(`${payload.record.name} cadastrado.`)
      setRevision((value) => value + 1)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }  function startEdit(row: RecordRow) {
    setEditing(row)
    setEditRoles(row.roles || [])
    setEditDays(row.availability || [])
  }
  async function saveEdit() {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/registry/team/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: editRoles, availability: editDays }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar o cadastro.')
      setSelected((current) => (current?.id === editing.id ? { ...current, ...payload.record } : current))
      setEditing(null)
      setRevision((value) => value + 1)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  }
  function teamActions(row: RecordRow) {
    return <div className='registry-actions'><select aria-label={`Status de ${row.name}`} value={row.status || 'pending'} disabled={busy || !admin} onChange={e=>void updateTeamStatus(row,e.target.value)}>{Object.entries(teamStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{admin && <Button size='sm' variant='outline' disabled={busy} onClick={() => startEdit(row)}>Editar função</Button>}</div>
  }
  function candidateActions(row: RecordRow) {
    return (
      <div className='registry-actions'>
        <select
          aria-label={`Avaliação de ${row.name}`}
          value={row.status || 'new'}
          disabled={busy || !admin || Boolean(row.teamId)}
          onChange={(event) => void review(row, event.target.value)}
        >
          {Object.entries(statuses).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        {row.teamId ? (
          <span className='text-xs text-emerald-700 dark:text-emerald-300'>
            Adicionado à equipe
          </span>
        ) : (
          admin &&
          row.status === 'approved' && (
            <Button
              size='sm'
              disabled={busy}
              onClick={() => void review(row, 'approved', true)}
            >
              Adicionar à equipe
            </Button>
          )
        )}
      </div>
    )
  }
  return (
    <section className='registry'>
      <div className='verdant-page-heading'>
        <div>
          <div className='verdant-eyebrow'>CENTRAL VERDANT</div>
          <h1>Cadastros</h1>
          <p>Pessoas, contatos e histórico da operação.</p>
        </div>
      </div>
      <nav className='registry-tabs' aria-label='Categorias de cadastros'>
        {categories.map((item) => (
          <Button
            key={item.id}
            variant={category === item.id ? 'secondary' : 'ghost'}
            aria-current={category === item.id ? 'page' : undefined}
            onClick={() => choose(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <label className='registry-mobile-category'>
        Categoria
        <select
          value={category}
          onChange={(event) => choose(event.target.value as Category)}
        >
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {professional ? (
        renderPeople(category === 'djs' ? 'DJ' : 'INFLUENCIADORES')
      ) : !permitted ? (
        <p className='rounded-lg border p-4'>
          O cadastro da equipe está disponível para administradores.
        </p>
      ) : (
        <>
          <div className='verdant-column-filter-bar'>
            <ColumnFilterControl label='Nome / contato' value={query} onChange={value=>{setQuery(value);setPage(0)}} />
            {category === 'clients' ? <ColumnFilterControl label='Evento' value={event} onChange={value=>{setEvent(value);setPage(0)}} options={[{value:'',label:'Todos os eventos'},...data.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(item=>({value:item.id,label:`${item.date} · ${item.name}`}))]} /> : <>
              <ColumnFilterControl label='Função' value={role} onChange={value=>{setRole(value);setPage(0)}} options={[{value:'',label:'Todas as funções'},...roles.map(value=>({value,label:value}))]} />
              <ColumnFilterControl label='Disponibilidade' value={availability} onChange={value=>{setAvailability(value);setPage(0)}} options={[{value:'',label:'Todas as disponibilidades'},...weekDays.map(value=>({value,label:value}))]} />
              <ColumnFilterControl label='Status' value={status} onChange={value=>{setStatus(value);setPage(0)}} options={[{value:'',label:'Todos os status'},...Object.entries(category==='team'?teamStatuses:statuses).map(([value,label])=>({value,label}))]} />
            </>}
            <Button size='sm' variant='ghost' onClick={()=>{setQuery('');setEvent('');setRole('');setAvailability('');setStatus('');setPage(0)}}>Limpar filtros</Button>
            <Button
              variant='outline'
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              Atualizar
            </Button>
            {admin && (category === 'team' || category === 'candidates') && (
              <Button disabled={busy || loading} onClick={startCreate}>Cadastrar</Button>
            )}
            {category === 'team' && (
              <>
                <input ref={csvInput} type='file' accept='.csv,text/csv' hidden aria-label='Arquivo CSV da equipe' onChange={(e) => void importTeamCsv(e.target.files?.[0])} />
                <Button variant='outline' disabled={busy || loading} onClick={() => csvInput.current?.click()}>{busy ? 'Importando…' : 'Importar planilha CSV'}</Button>
              </>
            )}
          </div>
          <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
            <b>
              {label}
              {result ? ` · ${result.total}` : ''}
            </b>
            {category !== 'clients' && (
              <a
                className='inline-flex min-h-11 items-center underline'
                href={category === 'team' ? '/equipe' : '/trabalhe-conosco'}
                target='_blank'
                rel='noreferrer'
              >
                Abrir formulário público
              </a>
            )}
          </div>
          {importMessage && <p role='status'>{importMessage}</p>}
          {error && (
            <p
              role='alert'
              className='rounded-lg border border-destructive p-3 text-destructive'
            >
              {error}
            </p>
          )}
          {loading || !result ? (
            !error && <p role='status'>Carregando cadastros…</p>
          ) : result.rows.length ? (
            <div className='registry-table-wrap'>
              <table className='registry-table'>
                <thead>
                  <tr>
                    <th>{sortHeader('name', 'Nome')}</th>
                    <th>{sortHeader('contact', 'Contato')}</th>
                    <th>
                      {category === 'clients'
                        ? 'Histórico'
                        : sortHeader('roles', 'Funções / disponibilidade')}
                    </th>
                    <th>
                      {category === 'candidates' ? sortHeader('status', 'Avaliação') : category === 'team' ? sortHeader('status', 'Status da equipe') : 'Origem'}
                    </th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          className='registry-name'
                          onClick={() => setSelected(row)}
                        >
                          {row.name}
                        </button>
                        {row.source === 'test' && <small>Cadastro de teste</small>}
                      </td>
                      <td>
                        {row.phone || row.whatsapp || '—'}
                        {row.email && <small>{row.email}</small>}
                      </td>
                      <td>
                        {category === 'clients' ? (
                          `${row.history?.length || 0} inscrições`
                        ) : (
                          <>
                            {row.roles?.join(', ') || 'Funções não informadas'}
                            <small>
                              {row.availability?.join(', ') ||
                                'Disponibilidade não informada'}
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        {category === 'candidates'
                          ? candidateActions(row)
                          : category === 'team'
                            ? teamActions(row)
                            : row.sourceSystem || 'Formulários de eventos'}
                      </td>
                      <td>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setSelected(row)}
                        >
                          Ver detalhes
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
              Nenhum cadastro corresponde aos filtros.
            </p>
          )}
          <div className='registry-pagination'>
            <span className='text-xs text-muted-foreground'>
              Página {page + 1}
              {result ? ` · ${result.total} registros` : ''}
            </span>
            <Button
              variant='outline'
              size='sm'
              disabled={loading || page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={loading || !result || (page + 1) * 50 >= result.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </div>
          {category === 'clients' && (
            <div>
              <Button
                variant='outline'
                onClick={() => setShowTools((value) => !value)}
                aria-expanded={showTools}
              >
                Importações e inscrições detalhadas
              </Button>
              {showTools && <div className='mt-4'>{tools}</div>}
            </div>
          )}
        </>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Novo cadastro · {category === 'team' ? 'Equipe' : 'Candidato'}</DialogTitle>
            <DialogDescription>Preencha os dados e escolha funções e dias.</DialogDescription>
          </DialogHeader>
          <label className='block space-y-1 text-sm'>
            Nome completo
            <input className='w-full' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className='block space-y-1 text-sm'>
            Telefone / WhatsApp (com DDD)
            <input className='w-full' inputMode='tel' value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </label>
          {category === 'team' ? (
            <label className='block space-y-1 text-sm'>
              Chave Pix (opcional)
              <input className='w-full' value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} />
            </label>
          ) : (
            <label className='block space-y-1 text-sm'>
              Experiência (opcional)
              <input className='w-full' value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
            </label>
          )}
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>Funções</legend>
            {roles.map((item) => (
              <label key={item} className='flex items-center gap-2 text-sm'>
                <input type='checkbox' className='size-4' checked={editRoles.includes(item)} onChange={() => setEditRoles((list) => toggle(list, item))} />
                {item}
              </label>
            ))}
          </fieldset>
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>Dias disponíveis</legend>
            {weekDays.map((item) => (
              <label key={item} className='flex items-center gap-2 text-sm'>
                <input type='checkbox' className='size-4' checked={editDays.includes(item)} onChange={() => setEditDays((list) => toggle(list, item))} />
                {item}
              </label>
            ))}
          </fieldset>
          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={() => setCreating(false)}>Cancelar</Button>
            <Button disabled={busy || !form.name.trim() || !form.whatsapp.trim() || !editRoles.length || !editDays.length} onClick={() => void saveCreate()}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Editar {editing?.name}</DialogTitle>
            <DialogDescription>Adicione ou troque funções e dias disponíveis.</DialogDescription>
          </DialogHeader>
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>Funções</legend>
            {roles.map((item) => (
              <label key={item} className='flex items-center gap-2 text-sm'>
                <input type='checkbox' className='size-4' checked={editRoles.includes(item)} onChange={() => setEditRoles((list) => toggle(list, item))} />
                {item}
              </label>
            ))}
          </fieldset>
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>Dias disponíveis</legend>
            {weekDays.map((item) => (
              <label key={item} className='flex items-center gap-2 text-sm'>
                <input type='checkbox' className='size-4' checked={editDays.includes(item)} onChange={() => setEditDays((list) => toggle(list, item))} />
                {item}
              </label>
            ))}
          </fieldset>
          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={busy || !editRoles.length || !editDays.length} onClick={() => void saveEdit()}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              Detalhes e histórico do cadastro.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className='space-y-4'>
              <dl className='registry-details'>
                <dt>Telefone / WhatsApp</dt>
                <dd>{selected.phone || selected.whatsapp || '—'}</dd>
                {selected.email && (
                  <>
                    <dt>E-mail</dt>
                    <dd>{selected.email}</dd>
                  </>
                )}
                {category !== 'clients' && (
                  <>
                    <dt>Funções</dt>
                    <dd>{selected.roles?.join(', ') || 'Não informado'}</dd>
                    <dt>Disponibilidade</dt>
                    <dd>
                      {selected.availability?.join(', ') || 'Não informado'}
                    </dd>
                    <dt>Experiência</dt>
                    <dd className='whitespace-pre-wrap'>
                      {selected.experience || 'Não informado'}
                    </dd>
                  </>
                )}
                {category === 'team' && admin && (
                  <>
                    <dt>Chave Pix</dt>
                    <dd>
                      {selected.source === 'test' ? 'Cadastro de teste — sem chave Pix' : selected.pixKey ||
                        'Pendente — solicitar atualização cadastral'}
                    </dd>
                  </>
                )}
              </dl>
              {category === 'candidates' && candidateActions(selected)}
              {category === 'team' && teamActions(selected)}
              {category === 'clients' && (
                <div>
                  <h3 className='font-semibold'>Histórico de inscrições</h3>
                  {selected.history?.length ? (
                    selected.history.map((row) => (
                      <article
                        key={row.id}
                        className='mt-2 rounded-lg border p-3 text-sm'
                      >
                        <b>{row.eventName}</b>
                        <p>
                          {row.eventDate} · {row.formKey} ·{' '}
                          {date(row.createdAt)}
                        </p>
                        {row.optionName && <p>{row.optionName}</p>}
                        {row.formKey === 'ANIVERSARIO' && (
                          <ol className='list-decimal ps-5'>
                            {birthdayGuestNames(row.guestNames).map(
                              (name, index) => (
                                <li key={index}>{name}</li>
                              )
                            )}
                          </ol>
                        )}
                      </article>
                    ))
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      Sem inscrições em formulários. Cadastro da base histórica.
                    </p>
                  )}
                </div>
              )}
              {category === 'team' && (
                <div>
                  <h3 className='font-semibold'>Histórico de atualizações</h3>
                  {selected.history?.map((row, index) => (
                    <p
                      key={row.id || index}
                      className='mt-2 rounded-lg border p-3 text-sm'
                    >
                      {date(row.createdAt)} ·{' '}
                      {row.roles?.join(', ') || 'Funções não informadas'} ·{' '}
                      {row.availability?.join(', ') ||
                        'Disponibilidade não informada'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
