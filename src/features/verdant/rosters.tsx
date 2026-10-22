import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import type { VerdantState } from './data'
import {
  baseRole,
  moveRosterEntry,
  dayAvailable,
  displayDate,
  posts,
  roles,
  weekday,
  type Roster,
  type RosterEntry,
  type RosterMember,
} from './roster-types'
import './rosters.css'

const blank = (): Roster => ({
  date: '',
  eventId: '',
  eventName: 'Verdant CWB',
  kind: 'security',
  status: 'draft',
  template: 4,
  entries: [],
})
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.error || 'Não foi possível carregar as escalas.')
  return body
}
export function RostersPage({
  data,
  historyOnly = false,
}: {
  data: VerdantState
  historyOnly?: boolean
}) {
  const admin = useAuthStore((s) => s.auth.user?.role.includes('admin'))
  const [rosters, setRosters] = useState<Roster[]>([]),
    [team, setTeam] = useState<RosterMember[]>([]),
    [draft, setDraft] = useState<Roster | null>(null)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState('')
  const [search, setSearch] = useState(''),
    [availabilityFilter, setAvailabilityFilter] = useState(''),
    [filter, setFilter] = useState(''),
    [eventFilter, setEventFilter] = useState('')
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null),
    lastUrl = useRef('')
  const [dirty, setDirty] = useState(false)
  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
    },
    []
  )
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  useEffect(() => {
    if (!admin) return
    let active = true
    api('/api/rosters')
      .then((result) => {
        if (active) {
          setRosters(result.rosters)
          setTeam(result.team)
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [admin])
  async function refresh() {
    try {
      setLoading(true)
      const result = await api('/api/rosters')
      setRosters(result.rosters)
      setTeam(result.team)
      setError('')
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setLoading(false)
    }
  }
  function change(patch: Partial<Roster>) {
    if (busy) return
    setDirty(true)
    setPdf(null)
    setDraft((current) => (current ? { ...current, ...patch } : current))
    setNotice('')
  }
  function start(roster: Roster) {
    if (busy) return
    if (dirty && !window.confirm('Descartar as alterações não salvas?')) return
    setDirty(false)
    setDraft(structuredClone(roster))
    setAvailabilityFilter(roster.date ? weekday(roster.date) : '')
    setSearch('')
    setError('')
    setNotice('')
    setPdf(null)
  }
  function updateEntry(index: number, patch: Partial<RosterEntry>) {
    if (draft)
      change({
        entries: draft.entries.map((entry, i) =>
          i === index ? { ...entry, ...patch } : entry
        ),
      })
  }
  async function save(status: Roster['status']) {
    if (!draft || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api(
        draft.id ? `/api/rosters/${draft.id}` : '/api/rosters',
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draft, status }),
        }
      )
      setDraft(result.roster)
      setRosters((current) => [
        result.roster,
        ...current.filter((row) => row.id !== result.roster.id),
      ])
      setDirty(false)
      setNotice(
        status === 'finalized'
          ? 'Escala finalizada e salva.'
          : 'Rascunho salvo.'
      )
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function generate(roster: Roster) {
    setBusy(true)
    setError('')
    try {
      const { createRosterPdf } = await import('./roster-pdf')
      const bytes = await createRosterPdf(roster)
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
      const url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
        ),
        name = `Verdant_${roster.kind === 'security' ? 'Seguranca' : 'STAFF'}_${roster.date}_Template_${roster.template}.pdf`
      lastUrl.current = url
      setPdf({ url, name })
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (!admin)
    return (
      <p className='rounded-lg border p-4'>
        Escalas estão disponíveis para administradores.
      </p>
    )
  const allowed = roles.filter((r) =>
    draft?.kind === 'security'
      ? ['Segurança', 'Líder de Segurança', 'Bombeiro'].includes(r)
      : !['Segurança', 'Líder de Segurança', 'Bombeiro'].includes(r)
  )
  const candidatePool = team
    .filter(
      (person) =>
        person.status === 'active' &&
        person.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
        !draft?.entries.some((entry) => entry.memberId === person.id) &&
        person.roles.some((r) => allowed.some((a) => baseRole(a) === r)) &&
        (!availabilityFilter || person.availability.some((day) => day.toLowerCase() === availabilityFilter.toLowerCase()))
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))

  const candidatesForRole = (selectedRole: string) =>
    candidatePool.filter((person) => person.roles.includes(baseRole(selectedRole)))

  const shown = rosters.filter(
    (row) =>
      (!filter || row.kind === filter) &&
      (!eventFilter || row.eventId === eventFilter)
  )
  return (
    <section className='rosters'>
      <div className='verdant-page-heading'>
        <div>
          <div className='verdant-eyebrow'>CENTRAL VERDANT</div>
          <h1>{historyOnly ? 'Histórico de escalas' : 'Escalas'}</h1>
          <p>Equipe, postos e jornadas por data.</p>
        </div>
        <div className='roster-actions'>
          <Button
            variant='outline'
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            Atualizar equipe
          </Button>
          {!historyOnly && (
            <Button disabled={busy} onClick={() => start(blank())}>
              Nova escala
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p
          role='alert'
          className='rounded-lg border border-destructive p-3 text-destructive'
        >
          {error}
        </p>
      )}
      {notice && (
        <p role='status' className='rounded-lg border p-3'>
          {notice}
        </p>
      )}
      {pdf && (
        <div className='roster-actions rounded-lg border p-3'>
          <a href={pdf.url} download={pdf.name} className='underline'>
            Baixar PDF
          </a>
          <a
            href={pdf.url}
            target='_blank'
            rel='noreferrer'
            className='underline'
          >
            Visualizar PDF
          </a>
        </div>
      )}
      {!draft && (
        <>
          <div className='roster-toolbar'>
            <label>
              Tipo
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value=''>Todas as escalas</option>
                <option value='security'>Segurança</option>
                <option value='staff'>STAFF</option>
              </select>
            </label>
            <label>
              Evento
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
              >
                <option value=''>Todos os eventos</option>
                {data.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name} · {displayDate(event.date)}
                  </option>
                ))}
              </select>
            </label>
            {historyOnly && (
              <a href='/verdant/escalas' className='underline'>
                Criar ou editar escalas
              </a>
            )}
          </div>
          {loading ? (
            <p role='status'>Carregando escalas…</p>
          ) : shown.length ? (
            <div className='roster-list'>
              {shown.map((row) => (
                <article className='roster-card' key={row.id}>
                  <div>
                    <b>
                      {displayDate(row.date)} · {row.eventName}
                    </b>
                    <p>
                      {row.kind === 'security' ? 'Segurança' : 'STAFF'} ·{' '}
                      {row.entries.length} profissionais ·{' '}
                      {row.status === 'draft' ? 'Rascunho' : 'Finalizada'}
                    </p>
                  </div>
                  <div className='roster-actions'>
                    {!historyOnly && (
                      <>
                        <Button variant='outline' onClick={() => start(row)}>
                          Editar
                        </Button>
                        <Button
                          variant='outline'
                          onClick={() =>
                            start({
                              ...row,
                              id: undefined,
                              version: undefined,
                              date: '',
                              eventId: '',
                              status: 'draft',
                              entries: row.entries.map((entry) => ({
                                ...entry,
                                exitDate: undefined,
                              })),
                            })
                          }
                        >
                          Duplicar
                        </Button>
                      </>
                    )}
                    <Button disabled={busy} onClick={() => void generate(row)}>
                      Gerar PDF · Modelo {row.template}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className='rounded-lg border border-dashed p-6'>
              Nenhuma escala encontrada. Crie uma escala para começar.
            </p>
          )}
        </>
      )}
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save('draft')
          }}
          className='roster-editor'
        >
          <div className='roster-grid'>
            <label>
              Tipo
              <select
                value={draft.kind}
                disabled={draft.entries.length > 0 || busy}
                onChange={(e) => {
                  change({ kind: e.target.value as Roster['kind'] })
                }}
              >
                <option value='security'>Segurança</option>
                <option value='staff'>STAFF</option>
              </select>
            </label>
            <label>
              Evento
              <select
                value={draft.eventId}
                onChange={(e) => {
                  const event = data.events.find(
                    (row) => row.id === e.target.value
                  )
                  change({
                    eventId: event?.id || '',
                    eventName: event?.name || 'Verdant CWB',
                    date: event?.date || draft.date,
                  })
                  if (event?.date) setAvailabilityFilter(weekday(event.date))
                }}
              >
                <option value=''>Escala por data, sem evento vinculado</option>
                {data.events.map((event) => (
                  <option value={event.id} key={event.id}>
                    {event.name} · {displayDate(event.date)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input
                type='date'
                required
                value={draft.date}
                onChange={(e) => {
                  change({
                    date: e.target.value,
                    eventId: '',
                    eventName: 'Verdant CWB',
                  })
                  setAvailabilityFilter(e.target.value ? weekday(e.target.value) : '')
                }}
              />
            </label>
            <label>
              Template do PDF
              <select
                value={draft.template}
                onChange={(e) => change({ template: Number(e.target.value) })}
              >
                {[
                  'Blocos destacados',
                  'Detalhes em verde',
                  'Clean',
                  'Minimalista e compacto',
                ].map((name, index) => (
                  <option key={name} value={index + 1}>
                    {index + 1} · {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className='roster-team-box'>
            <h2>Adicionar profissionais ativos</h2>
            <p className='text-sm text-muted-foreground'>
              Ative os cadastros em{' '}
              <a className='underline' href='/verdant/cadastros?category=team'>
                Cadastros → Equipe
              </a>
              . A inclusão abaixo respeita função/cargo e disponibilidade selecionados.
            </p>
            <div className='roster-toolbar'>
              <label>
                Disponibilidade
                <select
                  aria-label='Disponibilidade para adicionar'
                  value={['Quinta-feira','Sexta-feira','Sábado','Domingo'].find((day) => day.toLowerCase() === availabilityFilter.toLowerCase()) ?? ''}
                  onChange={(e) => setAvailabilityFilter(e.target.value)}
                >
                  <option value=''>Todas as disponibilidades</option>
                  {['Quinta-feira','Sexta-feira','Sábado','Domingo'].map((day) => <option key={day}>{day}</option>)}
                </select>
              </label>
              <label>
                Buscar profissional
                <input
                  type='search'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder='Digite o nome'
                />
              </label>
            </div>
            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {allowed.map((functionRole) => {
                const matches = candidatesForRole(functionRole)
                return (
                  <div key={functionRole} className='rounded-lg border p-3'>
                    <div className='mb-2 flex items-center justify-between gap-2'>
                      <b>{functionRole}</b>
                      <span className='text-xs text-muted-foreground'>{matches.length} disponível(is)</span>
                    </div>
                    <select
                      aria-label={`Adicionar ${functionRole}`}
                      value=''
                      disabled={!draft.date || busy || !matches.length}
                      onChange={(e) => {
                        const person = team.find((row) => row.id === e.target.value)
                        if (!person) return
                        change({
                          entries: [
                            ...draft.entries,
                            {
                              memberId: person.id,
                              name: person.name,
                              role: functionRole,
                              posts: [],
                              availability: person.availability,
                              entry: '',
                              exit: '',
                            },
                          ],
                        })
                      }}
                    >
                      <option value=''>{!draft.date ? 'Selecione a data primeiro' : matches.length ? 'Adicionar profissional…' : 'Nenhum profissional com estes filtros'}</option>
                      {matches.map((person) => (
                        <option key={person.id} value={person.id}>{person.name} · {person.availability.join(', ') || 'sem disponibilidade informada'}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
          <p className='text-sm'>
            <b>{draft.entries.length} profissionais</b>
            {draft.date
              ? ` · ${weekday(draft.date)} · ${displayDate(draft.date)}`
              : ''}
          </p>
          <p className='text-xs text-muted-foreground'>
            Adicione na ordem desejada ou use as setas para reorganizar. O PDF
            segue essa sequência: coluna esquerda, depois direita.
          </p>
          <div className='roster-entries'>
            {draft.entries.map((entry, index) => (
              <article key={entry.memberId} className='roster-entry'>
                <div className='roster-entry-title'>
                  <b>
                    {index + 1}. {entry.name}
                  </b>
                  <div className='roster-actions'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      aria-label={`Subir ${entry.name}`}
                      disabled={busy || index === 0}
                      onClick={() =>
                        change({
                          entries: moveRosterEntry(draft.entries, index, -1),
                        })
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      aria-label={`Descer ${entry.name}`}
                      disabled={busy || index === draft.entries.length - 1}
                      onClick={() =>
                        change({
                          entries: moveRosterEntry(draft.entries, index, 1),
                        })
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      disabled={busy}
                      onClick={() =>
                        change({
                          entries: draft.entries.filter((_, i) => i !== index),
                        })
                      }
                    >
                      Remover
                    </Button>
                  </div>
                </div>
                <p
                  className={`text-xs ${dayAvailable(entry, draft.date) ? 'text-emerald-600' : 'text-amber-600'}`}
                >
                  {dayAvailable(entry, draft.date)
                    ? 'Disponível nesta data'
                    : 'Conferir disponibilidade'}{' '}
                  · {entry.availability.join(', ') || 'Não informada'}
                  {team.find((p) => p.id === entry.memberId)?.status !==
                  'active'
                    ? ' · Cadastro não está ativo'
                    : ''}
                </p>
                <div className='roster-grid'>
                  <label>
                    Função
                    <select
                      value={entry.role}
                      disabled={busy}
                      onChange={(e) =>
                        updateEntry(index, { role: e.target.value })
                      }
                    >
                      {allowed
                        .filter((r) =>
                          team
                            .find((p) => p.id === entry.memberId)
                            ?.roles.includes(baseRole(r))
                        )
                        .map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                    </select>
                  </label>
                  <div className='roster-post-field'>
                    <span>Postos · múltipla seleção</span>
                    <details className='roster-posts'>
                      <summary>
                        {entry.posts.join(', ') || 'Selecionar postos'}
                      </summary>
                      <div>
                        {posts.map((post) => (
                          <label key={post}>
                            <input
                              type='checkbox'
                              aria-label={post}
                              checked={entry.posts.includes(post)}
                              disabled={busy}
                              onChange={(e) =>
                                updateEntry(index, {
                                  posts: e.target.checked
                                    ? [...entry.posts, post]
                                    : entry.posts.filter((p) => p !== post),
                                })
                              }
                            />
                            {post}
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                  <label>
                    Entrada
                    <input
                      type='time'
                      required
                      value={entry.entry}
                      disabled={busy}
                      onChange={(e) =>
                        updateEntry(index, { entry: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Saída
                    <input
                      type='time'
                      required
                      value={entry.exit}
                      disabled={busy}
                      onChange={(e) =>
                        updateEntry(index, { exit: e.target.value })
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
          <div className='roster-footer'>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm('Descartar alterações não salvas?')
                ) {
                  setDirty(false)
                  setDraft(null)
                }
              }}
            >
              Voltar
            </Button>
            <Button
              type='submit'
              formNoValidate
              variant='outline'
              disabled={busy}
            >
              Salvar rascunho
            </Button>
            <Button
              type='button'
              disabled={busy || !draft.entries.length}
              onClick={() => {
                const form =
                  document.querySelector<HTMLFormElement>('.roster-editor')
                if (form?.reportValidity()) void save('finalized')
              }}
            >
              {busy ? 'Salvando…' : 'Finalizar escala'}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={busy || !draft.id || dirty}
              onClick={() => void generate(draft)}
            >
              Gerar PDF do rascunho salvo
            </Button>
          </div>
          <p className='text-xs text-muted-foreground'>
            O PDF usa somente a última versão salva. Salve o rascunho antes de gerar ou visualizar o arquivo.
          </p>
        </form>
      )}
    </section>
  )
}
