import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  financeCategories,
  financeCsv,
  financeMethods,
  financeReport,
  financeStatuses,
  financeTemplate,
  financeTypes,
  formatCents,
  parseFinanceAmount,
  parseFinanceCsv,
  type FinanceData,
  type FinanceDraft,
  type FinanceEntry,
} from './finance-data'
import './finance.css'
import { ZigEventSummary } from './zig-event-summary'
import { ProductionImportPanel } from './production-import-panel'
import { InfluencerCommissionsPanel } from './influencer-commissions-panel'
import { InfluencerPayoutReportPanel } from './influencer-payout-report-panel'

const blank = (): FinanceDraft => ({
  externalId: `manual:${crypto.randomUUID()}`,
  type: 'payable',
  category: 'general',
  description: '',
  counterparty: '',
  beneficiaryId: '',
  eventId: '',
  amountCents: 0,
  dueDate: '',
  status: 'pending',
  settledDate: '',
  paymentMethod: '',
  notes: '',
})
function draftFields(entry: FinanceDraft): FinanceDraft {
  const {
    externalId,
    type,
    category,
    description,
    counterparty,
    beneficiaryId,
    eventId,
    amountCents,
    dueDate,
    status,
    settledDate,
    paymentMethod,
    notes,
  } = entry
  return {
    externalId,
    type,
    category,
    description,
    counterparty,
    beneficiaryId,
    eventId,
    amountCents,
    dueDate,
    status,
    settledDate,
    paymentMethod,
    notes,
  }
}
const dateLabel = (date: string) =>
  date ? date.split('-').reverse().join('/') : '—'
const eventLabel = (event: { name: string; date: string; active?: boolean }) =>
  `${event.date.slice(8, 10)}/${event.date.slice(5, 7)} · ${event.name}${event.active === false ? ' (inativo)' : ''}`
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Não foi possível concluir a operação.'
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
function isLedger(value: unknown): value is Pick<
  FinanceData,
  'revision' | 'entries'
> & {
  imported?: number
  skipped?: number
} {
  return (
    record(value) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    Array.isArray(value.entries) &&
    value.entries.every(
      (entry) =>
        record(entry) &&
        [
          'id',
          'externalId',
          'description',
          'counterparty',
          'beneficiaryId',
          'eventId',
          'dueDate',
          'settledDate',
          'notes',
          'createdAt',
          'updatedAt',
        ].every((key) => typeof entry[key] === 'string') &&
        ['payable', 'receivable'].includes(String(entry.type)) &&
        ['general', 'team', 'dj', 'influencer', 'sales'].includes(String(entry.category)) &&
        ['pending', 'settled', 'cancelled'].includes(String(entry.status)) &&
        ['', 'cash', 'pix', 'transfer', 'card', 'other'].includes(
          String(entry.paymentMethod)
        ) &&
        Number.isSafeInteger(entry.amountCents) &&
        Number(entry.amountCents) > 0 &&
        Array.isArray(entry.history) &&
        entry.history.every(
          (item) =>
            record(item) &&
            ['action', 'actor', 'at'].every(
              (key) => typeof item[key] === 'string'
            )
        )
    )
  )
}
function isFinanceData(value: unknown): value is FinanceData {
  if (!record(value)) return false
  const { beneficiaries, events } = value
  return (
    isLedger(value) &&
    Array.isArray(beneficiaries) &&
    beneficiaries.every(
      (person) =>
        record(person) &&
        typeof person.id === 'string' &&
        typeof person.name === 'string' &&
        ['team', 'dj', 'influencer'].includes(String(person.kind)) &&
        (person.pixKey === undefined || typeof person.pixKey === 'string')
    ) &&
    Array.isArray(events) &&
    events.every(
      (event) =>
        record(event) &&
        ['id', 'name', 'date'].every((key) => typeof event[key] === 'string')
    )
  )
}
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className='finance-field'>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
function History({ entry }: { entry?: FinanceEntry }) {
  return (
    entry && (
      <section aria-label='Histórico de auditoria'>
        <h3>Histórico de auditoria</h3>
        {entry.history.length ? (
          <ul>
            {entry.history.map((item, index) => (
              <li key={index}>
                {(
                  {
                    created: 'Criado',
                    updated: 'Atualizado',
                    settled: 'Baixado',
                    cancelled: 'Cancelado',
                    reopened: 'Reaberto',
                  } as Record<string, string>
                )[item.action] || item.action}
                {' · '}
                {item.actor}
                {' · '}
                {new Date(item.at).toLocaleString('pt-BR')}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma alteração registrada.</p>
        )}
      </section>
    )
  )
}

export function FinancePage() {
  const admin = useAuthStore((state) => state.auth.user?.role.includes('admin'))
  if (!admin)
    return (
      <section>
        <h1>Financeiro</h1>
        <p>Acesso restrito a administradores.</p>
      </section>
    )
  return <AdminFinance />
}

function AdminFinance() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [valid, setValid] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [tab, setTab] = useState<'ledger' | 'cash' | 'summary' | 'influencer-payouts' | 'influencer-report'>('ledger')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEvent, setBulkEvent] = useState('')
  const eventOptions = useMemo(
    () => [...(data?.events ?? [])].sort((a, b) => Number(a.active === false) - Number(b.active === false) || a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
    [data?.events]
  )
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [eventId, setEventId] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<FinanceDraft | null>(null)
  const [editingId, setEditingId] = useState('')
  const [amount, setAmount] = useState('')
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState<FinanceDraft[] | null>(null)
  const [reading, setReading] = useState(false)
  const [action, setAction] = useState<{
    entry: FinanceEntry
    kind: 'settle' | 'cancel' | 'reopen'
  } | null>(null)
  const [settledDate, setSettledDate] = useState('')
  const [method, setMethod] = useState<FinanceDraft['paymentMethod']>('')
  const lock = useRef(false)
  const active = useRef(true)
  const manualId = useRef('')

  async function load(signal?: AbortSignal) {
    setValid(false)
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/finance', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      if (!response.ok)
        throw new Error(
          'Não foi possível carregar o financeiro. Saldos não confirmados.'
        )
      const result: unknown = await response.json()
      if (!isFinanceData(result))
        throw new Error('Resposta financeira inválida. Saldos não confirmados.')
      if (active.current && !signal?.aborted) {
        setData(result)
        setValid(true)
      }
    } catch (cause) {
      if (active.current && !signal?.aborted) setLoadError(message(cause))
    } finally {
      if (active.current && !signal?.aborted) setLoading(false)
    }
  }
  useEffect(() => {
    active.current = true
    const controller = new AbortController()
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(controller.signal)
    })
    return () => {
      active.current = false
      controller.abort()
    }
  }, [])
  useEffect(() => {
    function protect(event: BeforeUnloadEvent) {
      if (dirty || preview) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty, preview])

  let report: ReturnType<typeof financeReport> | null = null
  let reportError = ''
  if (data && valid) {
    try {
      report = financeReport(data.entries, { from, to, eventId })
    } catch (cause) {
      reportError = message(cause)
    }
  }
  const disabled = !valid || loading || busy || conflict || !!reportError
  async function mutate(entries: FinanceDraft[], id?: string) {
    if (disabled || lock.current || !data) return false
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    let uncertain = true
    try {
      const response = await fetch(
        id ? `/api/finance/${encodeURIComponent(id)}` : '/api/finance',
        {
          method: id ? 'PUT' : 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            id
              ? { revision: data.revision, ...draftFields(entries[0]) }
              : { revision: data.revision, entries: entries.map(draftFields) }
          ),
        }
      )
      if (response.status === 409) {
        setConflict(true)
        setError(
          'Os dados foram alterados por outra pessoa. Solicitamos a versão atual; revise e reaplique sua operação após carregar. Nada foi reenviado.'
        )
        await load()
        return false
      }
      const result = await response.json()
      if (!response.ok) {
        uncertain = response.status >= 500
        throw new Error(result.error || 'Não foi possível salvar o lançamento.')
      }
      if (!isLedger(result)) throw new Error('Resposta da gravação inválida.')
      if (!active.current) return false
      setData(
        (current) =>
          current && {
            ...current,
            revision: result.revision,
            entries: result.entries,
          }
      )
      setNotice(
        id
          ? 'Lançamento atualizado. Nenhuma transferência foi realizada.'
          : `${result.imported ?? entries.length} lançamento(s) incluído(s); ${result.skipped ?? 0} duplicado(s) ignorado(s).`
      )
      return true
    } catch (cause) {
      if (active.current) {
        if (uncertain) {
          setConflict(true)
          setError(
            'Resultado da gravação não confirmado. Solicitamos os dados atuais; confira os lançamentos existentes antes de revisar e tentar novamente. Nada foi reenviado.'
          )
          await load()
        } else setError(message(cause))
      }
      return false
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  function applyPreset(kind: 'day' | 'week' | 'month' | 'all') {
    const now = new Date()
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    if (kind === 'all') { setFrom(''); setTo(''); return }
    if (kind === 'day') { setFrom(key(now)); setTo(key(now)); return }
    if (kind === 'month') {
      setFrom(key(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(key(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
      return
    }
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
    setFrom(key(monday))
    setTo(key(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)))
  }
  async function bulkLink() {
    if (disabled || lock.current || !data || !selectedIds.size) return
    if (!window.confirm(`Vincular ${selectedIds.size} lançamento(s) a ${bulkEvent ? 'este evento' : 'nenhum evento'}? Nenhum valor é alterado; o histórico registra a mudança.`)) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/finance', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: data.revision, bulk: { ids: [...selectedIds], eventId: bulkEvent } }),
      })
      const result = await response.json()
      if (response.status === 409) {
        setConflict(true)
        setError('Os dados foram alterados por outra pessoa. Recarregamos a versão atual; selecione de novo e reaplique.')
        await load()
        return
      }
      if (!response.ok) throw new Error(result.error || 'Não foi possível vincular em massa.')
      if (!isLedger(result)) throw new Error('Resposta da gravação inválida.')
      setData((current) => current && { ...current, revision: result.revision, entries: result.entries })
      setSelectedIds(new Set())
      setNotice(`${(result as { updated?: number }).updated ?? 0} lançamento(s) vinculado(s); ${result.skipped ?? 0} já estavam nesse evento.`)
    } catch (cause) {
      setError(message(cause))
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  function open(entry?: FinanceEntry) {
    const next = entry ? { ...entry } : blank()
    manualId.current = entry ? '' : next.externalId
    setEditingId(entry?.id || '')
    setDraft(next)
    setAmount(
      entry ? (entry.amountCents / 100).toFixed(2).replace('.', ',') : ''
    )
    setDirty(false)
    setError('')
  }
  function closeEditor() {
    if (
      busy ||
      (dirty && !window.confirm('Descartar as alterações não salvas?'))
    )
      return
    setDraft(null)
    setDirty(false)
  }
  function reviewConflict() {
    if (
      editingId &&
      draft &&
      !window.confirm('Substituir o formulário pela versão atual para revisar?')
    )
      return
    if (draft && editingId) {
      const latest = data?.entries.find((entry) => entry.id === editingId)
      if (latest) open(latest)
      else {
        setDraft(null)
        setDirty(false)
      }
    }
    setAction(null)
    setConflict(false)
    setError('')
  }
  function change<K extends keyof FinanceDraft>(
    key: K,
    value: FinanceDraft[K]
  ) {
    setDraft((current) => current && { ...current, [key]: value })
    setDirty(true)
  }
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    try {
      const next = {
        ...draft,
        externalId: editingId ? draft.externalId : manualId.current,
        amountCents: parseFinanceAmount(amount),
      }
      if (await mutate([next], editingId || undefined)) {
        setDraft(null)
        setDirty(false)
      }
    } catch (cause) {
      setError(message(cause))
    }
  }
  async function readCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || disabled || reading || !data) return
    setReading(true)
    setError('')
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error('O CSV deve ter até 2 MiB.')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer()
      )
      const rows = parseFinanceCsv(text, data.beneficiaries, data.entries)
      const existingIds = new Set(data.entries.map((entry) => entry.externalId))
      const invalidEventIndex = rows.findIndex(
        (row) =>
          !existingIds.has(row.externalId) &&
          row.eventId &&
          !data.events.some((event) => event.id === row.eventId)
      )
      if (invalidEventIndex !== -1) {
        throw new Error(
          `Linha ${invalidEventIndex + 2}: evento_id não encontrado.`
        )
      }
      setPreview(rows)
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? 'Arquivo inválido. Exporte CSV em UTF-8.'
          : message(cause)
      )
    } finally {
      setReading(false)
    }
  }
  const matches = (entry: FinanceDraft) =>
    (!type || entry.type === type) &&
    (!status || entry.status === status) &&
    (!category || entry.category === category) &&
    (!eventId || entry.eventId === eventId) &&
    (!search ||
      `${entry.description} ${entry.counterparty} ${entry.externalId}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR')))
  const ledger = (data?.entries || []).filter(
    (entry) =>
      matches(entry) &&
      (!from || entry.dueDate >= from) &&
      (!to || entry.dueDate <= to)
  )
  const visible = tab === 'cash' ? (report?.cash || []).filter(matches) : ledger
  const editing = data?.entries.find((entry) => entry.id === editingId)
  const editable = !editing || editing.status === 'pending'
  const selected = data?.beneficiaries.find(
    (person) => person.id === draft?.beneficiaryId
  )
  function exportCsv() {
    if (!report) return
    const rows: (string | number)[][] = visible.map((entry) => [
      entry.externalId,
      entry.description,
      entry.counterparty,
      financeTypes[entry.type],
      financeCategories[entry.category],
      financeStatuses[entry.status],
      (entry.amountCents / 100).toFixed(2).replace('.', ','),
      dateLabel(entry.dueDate),
      dateLabel(entry.settledDate),
      entry.paymentMethod ? financeMethods[entry.paymentMethod] : '',
      entry.eventId,
      entry.beneficiaryId,
      entry.notes,
    ])
    rows.push(
      [],
      ['Resumo do período / evento (todos os tipos, categorias e situações)'],
      ['Início', from || 'Todas as datas'],
      ['Fim', to || 'Todas as datas'],
      ['Evento', eventId || 'Todos'],
      ...Object.entries({
        'Saldo inicial registrado': report.opening,
        Recebido: report.incoming,
        Pago: report.outgoing,
        'Saldo final registrado': report.balance,
        'Pendente a pagar': report.payable,
        'Pendente a receber': report.receivable,
        'Pago à equipe': report.team,
        'Pago a DJs': report.dj,
      }).map(([label, value]) => [label, formatCents(value)])
    )
    download(
      financeCsv(
        [
          'ID externo',
          'Descrição',
          'Favorecido',
          'Tipo',
          'Categoria',
          'Situação',
          'Valor (R$)',
          'Vencimento',
          'Data da baixa',
          'Forma de pagamento',
          'Evento ID',
          'Beneficiário ID',
          'Observações',
        ],
        rows
      ),
      `financeiro-${tab}.csv`
    )
  }

  return (
    <section className='finance-page' aria-label='Financeiro'>
      <ProductionImportPanel onImported={() => void load()} />
      <div className='finance-heading'>
        <div>
          <h1>Financeiro</h1>
          <p>
            Controle administrativo de contas e baixas. Registrar pagamentos não
            realiza transferências.
          </p>
        </div>
        <Button disabled={disabled} onClick={() => open()}>
          Novo lançamento
        </Button>
      </div>
      {loading && <p role='status'>Carregando financeiro…</p>}
      {loadError && (
        <div role='alert'>
          <p>{loadError}</p>
          <p>Não há saldo confirmado. Operações bloqueadas até atualizar.</p>
          <Button disabled={loading || busy} onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {error && <p role='alert'>{error}</p>}
      {notice && <p role='status'>{notice}</p>}
      {conflict && valid && (
        <Button disabled={busy} onClick={reviewConflict}>
          Revisar dados atualizados antes de reaplicar
        </Button>
      )}
      <Card className='finance-panel'>
        <h2>Período e evento</h2>
        <div className='finance-actions'>
          {(
            [
              ['day', 'Hoje'],
              ['week', 'Esta semana'],
              ['month', 'Este mês'],
              ['all', 'Todo o período'],
            ] as const
          ).map(([key, label]) => (
            <Button key={key} type='button' size='sm' variant='outline' onClick={() => applyPreset(key)}>
              {label}
            </Button>
          ))}
        </div>
        <div className='finance-grid'>
          <Field id='finance-from' label='Data inicial'>
            <Input
              id='finance-from'
              type='date'
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field id='finance-to' label='Data final'>
            <Input
              id='finance-to'
              type='date'
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field id='finance-event-filter' label='Evento'>
            <select
              id='finance-event-filter'
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value=''>Todos os eventos</option>
              {eventOptions.map((event) => (
                <option key={event.id} value={event.id}>
                  {eventLabel(event)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {reportError && (
          <p role='alert'>
            Relatório indisponível: {reportError} Ajuste o período ou os dados
            antes de operar.
          </p>
        )}
        <p>
          Lista por vencimento; caixa por data da baixa. Sem datas selecionadas,
          considera todo o histórico.
        </p>
      </Card>
      {report && (
        <section aria-label='Resumo financeiro'>
          <h2>Caixa registrado</h2>
          <p>
            Saldo derivado exclusivamente das baixas registradas. Saldo inicial
            = recebimentos menos pagamentos anteriores ao período; sem
            saldo-base presumido. Resumo considera período e evento,
            independentemente dos filtros da lista.
          </p>
          <div className='finance-summary'>
            {(
              [
                ['Saldo inicial registrado', report.opening],
                ['Recebido no período', report.incoming],
                ['Pago no período', report.outgoing],
                ['Saldo final registrado', report.balance],
                ['Pendente a pagar (vencimento)', report.payable],
                ['Pendente a receber (vencimento)', report.receivable],
                ['Pagamentos à equipe registrados', report.team],
                ['Pagamentos a DJs registrados', report.dj],
              ] as const
            ).map(([label, value]) => (
              <Card className='finance-panel' key={label}>
                <h3>{label}</h3>
                <strong>{formatCents(value)}</strong>
              </Card>
            ))}
          </div>
        </section>
      )}
      <Card className='finance-panel'>
        <div className='finance-actions' aria-label='Visualização'>
          <Button
            variant={tab === 'ledger' ? 'default' : 'outline'}
            aria-pressed={tab === 'ledger'}
            onClick={() => setTab('ledger')}
          >
            Lançamentos
          </Button>
          <Button
            variant={tab === 'cash' ? 'default' : 'outline'}
            aria-pressed={tab === 'cash'}
            onClick={() => setTab('cash')}
          >
            Caixa / relatório
          </Button>
          <Button
            variant={tab === 'summary' ? 'default' : 'outline'}
            aria-pressed={tab === 'summary'}
            onClick={() => setTab('summary')}
          >
            Resumo financeiro
          </Button>
          <Button variant={tab === 'influencer-payouts' ? 'default' : 'outline'} aria-pressed={tab === 'influencer-payouts'} onClick={() => setTab('influencer-payouts')}>Repasses de influencers</Button>
          <Button variant={tab === 'influencer-report' ? 'default' : 'outline'} aria-pressed={tab === 'influencer-report'} onClick={() => setTab('influencer-report')}>Relatório de repasses</Button>
          {(tab === 'ledger' || tab === 'cash') && <Button
            variant='outline'
            disabled={!report || busy}
            onClick={exportCsv}
          >
            Exportar CSV
          </Button>}
        </div>
        {tab === 'influencer-payouts' ? <InfluencerCommissionsPanel onChanged={() => void load()} /> : tab === 'influencer-report' ? <InfluencerPayoutReportPanel eventId={eventId || undefined} from={from} to={to} /> : tab === 'summary' ? <ZigEventSummary from={from} to={to} /> : (
        <>
        <div className='finance-grid'>
          <Field id='finance-type-filter' label='Filtrar tipo'>
            <select
              id='finance-type-filter'
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value=''>Todos</option>
              {Object.entries(financeTypes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id='finance-status-filter' label='Filtrar situação'>
            <select
              id='finance-status-filter'
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value=''>Todas</option>
              {Object.entries(financeStatuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id='finance-category-filter' label='Filtrar categoria'>
            <select
              id='finance-category-filter'
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value=''>Todas</option>
              {Object.entries(financeCategories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id='finance-search' label='Buscar lançamento'>
            <Input
              id='finance-search'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
        {valid && !reportError && (
          <div className='finance-table'>
            <div className='finance-actions'>
              <label>
                <input
                  type='checkbox'
                  checked={visible.length > 0 && visible.every((entry) => selectedIds.has(entry.id))}
                  onChange={(e) => setSelectedIds(e.target.checked ? new Set(visible.map((entry) => entry.id)) : new Set())}
                />{' '}
                Selecionar todos do filtro ({selectedIds.size})
              </label>
              <select aria-label='Evento para vincular' value={bulkEvent} onChange={(e) => setBulkEvent(e.target.value)}>
                <option value=''>Sem evento</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {eventLabel(event)}
                  </option>
                ))}
              </select>
              <Button variant='outline' disabled={disabled || !selectedIds.size} onClick={() => void bulkLink()}>
                Vincular evento às selecionadas
              </Button>
            </div>
            <table>
              <caption>
                {tab === 'cash'
                  ? 'Pagamentos e recebimentos efetivamente registrados (data da baixa)'
                  : 'Contas por vencimento'}
              </caption>
              <thead>
                <tr>
                  <th>Sel.</th>
                  <th>Descrição / favorecido</th>
                  <th>Tipo / categoria</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Situação / baixa</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <input
                        type='checkbox'
                        aria-label={`Selecionar ${entry.description}`}
                        checked={selectedIds.has(entry.id)}
                        onChange={(e) => setSelectedIds((current) => { const next = new Set(current); if (e.target.checked) next.add(entry.id); else next.delete(entry.id); return next })}
                      />
                    </td>
                    <td>
                      {entry.description}
                      <small>{entry.counterparty}</small>
                    </td>
                    <td>
                      {financeTypes[entry.type]}
                      <small>{financeCategories[entry.category]}</small>
                    </td>
                    <td>{formatCents(entry.amountCents)}</td>
                    <td>{dateLabel(entry.dueDate)}</td>
                    <td>
                      {financeStatuses[entry.status]}
                      {entry.status === 'settled' && (
                        <small>
                          {dateLabel(entry.settledDate)} ·{' '}
                          {entry.paymentMethod &&
                            financeMethods[entry.paymentMethod]}
                        </small>
                      )}
                    </td>
                    <td>
                      <div className='finance-actions'>
                        <Button
                          variant='outline'
                          disabled={disabled}
                          onClick={() => open(entry)}
                          aria-label={`Detalhes de ${entry.description}`}
                        >
                          Detalhes / editar
                        </Button>
                        {entry.status === 'pending' && (
                          <>
                            <Button
                              disabled={disabled}
                              onClick={() => {
                                setAction({ entry, kind: 'settle' })
                                setSettledDate('')
                                setMethod('')
                              }}
                              aria-label={`Baixar ${entry.description}`}
                            >
                              Baixar
                            </Button>
                            <Button
                              variant='outline'
                              disabled={disabled}
                              onClick={() =>
                                setAction({ entry, kind: 'cancel' })
                              }
                              aria-label={`Cancelar ${entry.description}`}
                            >
                              Cancelar
                            </Button>
                          </>
                        )}
                        {entry.status !== 'pending' && (
                          <Button
                            variant='outline'
                            disabled={disabled}
                            onClick={() => setAction({ entry, kind: 'reopen' })}
                            aria-label={`Reabrir ${entry.description}`}
                          >
                            {entry.status === 'settled'
                              ? 'Estornar / reabrir'
                              : 'Reabrir'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && <p>Nenhum lançamento neste filtro.</p>}
          </div>
        )}
        </>
        )}
      </Card>
      <Card className='finance-panel'>
        <h2>Importar planilha</h2>
        <p>
          Exporte CSV UTF-8 pelo Excel ou Google Sheets (até 2 MiB e 1.000
          linhas). Não aceita XLSX. A seleção apenas prepara uma prévia;
          confirme para gravar. IDs externos repetidos são ignorados, nunca
          substituídos automaticamente.
        </p>
        <div className='finance-actions'>
          <Button
            variant='outline'
            onClick={() => download(financeTemplate(), 'modelo-financeiro.csv')}
          >
            Baixar modelo CSV
          </Button>
          <Field id='finance-file' label='Selecionar CSV'>
            <Input
              id='finance-file'
              type='file'
              accept='.csv,text/csv'
              disabled={disabled || reading || !!preview}
              onChange={(event) => void readCsv(event)}
            />
          </Field>
        </div>
        {reading && <p role='status'>Lendo CSV…</p>}
        {preview && (
          <section aria-label='Prévia da importação'>
            <h3>Prévia: {preview.length} lançamento(s)</h3>
            <p>
              A pagar:{' '}
              {formatCents(
                preview
                  .filter((row) => row.type === 'payable')
                  .reduce((sum, row) => sum + row.amountCents, 0)
              )}{' '}
              · A receber:{' '}
              {formatCents(
                preview
                  .filter((row) => row.type === 'receivable')
                  .reduce((sum, row) => sum + row.amountCents, 0)
              )}
              . Totais de todas as linhas, incluindo duplicados que poderão ser
              ignorados.
            </p>
            <div className='finance-table'>
              <table>
                <caption>
                  Primeiras {Math.min(20, preview.length)} linhas de{' '}
                  {preview.length}
                </caption>
                <thead>
                  <tr>
                    <th>ID externo</th>
                    <th>Descrição</th>
                    <th>Favorecido</th>
                    <th>Tipo / categoria</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((row) => (
                    <tr key={row.externalId}>
                      <td>{row.externalId}</td>
                      <td>{row.description}</td>
                      <td>{row.counterparty}</td>
                      <td>
                        {financeTypes[row.type]} /{' '}
                        {financeCategories[row.category]}
                      </td>
                      <td>{formatCents(row.amountCents)}</td>
                      <td>{dateLabel(row.dueDate)}</td>
                      <td>{financeStatuses[row.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className='finance-actions'>
              <Button
                disabled={disabled}
                onClick={async () => {
                  if (await mutate(preview)) setPreview(null)
                }}
              >
                Confirmar importação
              </Button>
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Descartar prévia
              </Button>
            </div>
          </section>
        )}
        <details>
          <summary>Referências para planilha</summary>
          <p>
            Equipe, DJs e influencers são apenas contas a pagar. Repasses de influencers exigem entrada confirmada. Informe beneficiario_id ou
            favorecido com nome único da categoria; o nome é resolvido na
            prévia. evento_id é opcional.
          </p>
          <div className='finance-table'>
            <table>
              <caption>Beneficiários existentes</caption>
              <thead>
                <tr>
                  <th>beneficiario_id</th>
                  <th>Nome</th>
                  <th>Categoria</th>
                </tr>
              </thead>
              <tbody>
                {data?.beneficiaries.map((person) => (
                  <tr key={person.id}>
                    <td>{person.id}</td>
                    <td>{person.name}</td>
                    <td>{financeCategories[person.kind]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className='finance-table'>
            <table>
              <caption>Eventos existentes</caption>
              <thead>
                <tr>
                  <th>evento_id</th>
                  <th>Nome</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data?.events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.id}</td>
                    <td>{event.name}</td>
                    <td>{dateLabel(event.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
      <Dialog
        open={!!draft}
        onOpenChange={(value) => {
          if (!value) closeEditor()
        }}
      >
        <DialogContent className='finance-dialog'>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Detalhes do lançamento' : 'Novo lançamento'}
            </DialogTitle>
            <DialogDescription>
              Somente pendentes podem ser editados. Baixados exigem estorno /
              reabertura antes de alterar valores.
            </DialogDescription>
          </DialogHeader>
          {error && <p role='alert'>{error}</p>}
          {loadError && (
            <p role='alert'>
              {loadError} Feche o formulário para tentar carregar novamente.
            </p>
          )}
          {conflict && valid && (
            <Button disabled={busy} onClick={reviewConflict}>
              Revisar versão atual do formulário
            </Button>
          )}
          {draft && (
            <form onSubmit={(event) => void save(event)}>
              <fieldset
                disabled={disabled || !editable}
                className='finance-grid'
              >
                <Field id='finance-type' label='Tipo'>
                  <select
                    id='finance-type'
                    value={draft.type}
                    onChange={(e) =>
                      change('type', e.target.value as FinanceDraft['type'])
                    }
                  >
                    <option value='payable'>A pagar</option>
                    <option
                      value='receivable'
                      disabled={draft.category === 'team' || draft.category === 'dj' || draft.category === 'influencer'}
                    >
                      A receber
                    </option>
                  </select>
                </Field>
                <Field id='finance-category' label='Categoria'>
                  <select
                    id='finance-category'
                    value={draft.category}
                    onChange={(e) => {
                      change(
                        'category',
                        e.target.value as FinanceDraft['category']
                      )
                      change('beneficiaryId', '')
                    }}
                  >
                    <option value='general'>Geral</option>
                    <option value='sales' disabled={draft.type !== 'receivable'}>
                      Vendas Zig
                    </option>
                    <option value='team' disabled={draft.type !== 'payable'}>
                      Equipe
                    </option>
                    <option value='dj' disabled={draft.type !== 'payable'}>
                      DJ
                    </option>
                    {draft.category === 'influencer' && <option value='influencer'>Influencer · entrada confirmada</option>}
                  </select>
                </Field>
                <Field id='finance-description' label='Descrição'>
                  <Input
                    id='finance-description'
                    required
                    maxLength={300}
                    value={draft.description}
                    onChange={(e) => change('description', e.target.value)}
                  />
                </Field>
                <Field
                  id='finance-counterparty'
                  label='Favorecido / contraparte'
                >
                  <Input
                    id='finance-counterparty'
                    required
                    maxLength={200}
                    readOnly={draft.category === 'team' || draft.category === 'dj' || draft.category === 'influencer'}
                    value={draft.counterparty}
                    onChange={(e) => change('counterparty', e.target.value)}
                  />
                </Field>
                {(draft.category === 'team' || draft.category === 'dj' || draft.category === 'influencer') && (
                  <Field id='finance-beneficiary' label='Beneficiário'>
                    <select
                      id='finance-beneficiary'
                      required
                      value={draft.beneficiaryId}
                      onChange={(e) => {
                        change('beneficiaryId', e.target.value)
                        const person = data?.beneficiaries.find(
                          (item) => item.id === e.target.value
                        )
                        if (person) change('counterparty', person.name)
                        else if (editing?.beneficiaryId === e.target.value)
                          change('counterparty', editing.counterparty)
                      }}
                    >
                      <option value=''>Selecione</option>
                      {editing?.beneficiaryId &&
                        editing.category === draft.category &&
                        !data?.beneficiaries.some(
                          (person) =>
                            person.id === editing.beneficiaryId &&
                            person.kind === draft.category
                        ) && (
                          <option value={editing.beneficiaryId}>
                            {editing.counterparty} · {editing.beneficiaryId}{' '}
                            (cadastro histórico indisponível)
                          </option>
                        )}
                      {data?.beneficiaries
                        .filter((person) => person.kind === draft.category)
                        .map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name} · {person.id}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                {selected && (
                  <p>
                    Pix do beneficiário selecionado:{' '}
                    {selected.pixKey || 'Não cadastrado'}. Apenas referência;
                    nenhuma transferência automática.
                  </p>
                )}
                <Field id='finance-amount' label='Valor (R$)'>
                  <Input
                    id='finance-amount'
                    required
                    inputMode='decimal'
                    placeholder='1.234,56'
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value)
                      setDirty(true)
                    }}
                  />
                </Field>
                <Field id='finance-due' label='Vencimento'>
                  <Input
                    id='finance-due'
                    type='date'
                    required
                    value={draft.dueDate}
                    onChange={(e) => change('dueDate', e.target.value)}
                  />
                </Field>
                <Field id='finance-event' label='Vincular evento (opcional)'>
                  <select
                    id='finance-event'
                    value={draft.eventId}
                    onChange={(e) => change('eventId', e.target.value)}
                  >
                    <option value=''>Sem evento</option>
                    {editing?.eventId &&
                      !data?.events.some(
                        (event) => event.id === editing.eventId
                      ) && (
                        <option value={editing.eventId}>
                          Evento histórico · {editing.eventId} (fora do
                          cadastro)
                        </option>
                      )}
                    {data?.events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name} · {event.id}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id='finance-external'
                  label={
                    editingId
                      ? 'ID externo (opcional)'
                      : 'ID externo (automático)'
                  }
                >
                  <Input
                    id='finance-external'
                    maxLength={160}
                    readOnly={!editingId}
                    value={draft.externalId}
                    onChange={(e) => change('externalId', e.target.value)}
                  />
                </Field>
                <Field id='finance-notes' label='Observações'>
                  <textarea
                    id='finance-notes'
                    maxLength={5000}
                    value={draft.notes}
                    onChange={(e) => change('notes', e.target.value)}
                  />
                </Field>
              </fieldset>
              {editing && (
                <p>
                  Situação: {financeStatuses[editing.status]}
                  {editing.status === 'settled' &&
                    ` · ${dateLabel(editing.settledDate)} · ${editing.paymentMethod && financeMethods[editing.paymentMethod]}`}
                </p>
              )}
              <History entry={editing} />
              <div className='finance-actions'>
                {editable && (
                  <Button type='submit' disabled={disabled}>
                    Salvar lançamento
                  </Button>
                )}
                <Button
                  type='button'
                  variant='outline'
                  disabled={busy}
                  onClick={closeEditor}
                >
                  Fechar formulário
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!action}
        onOpenChange={(value) => {
          if (!value && !busy) setAction(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === 'settle'
                ? 'Registrar baixa'
                : action?.kind === 'cancel'
                  ? 'Cancelar lançamento'
                  : action?.entry.status === 'cancelled'
                    ? 'Reabrir lançamento cancelado'
                    : 'Estornar e reabrir lançamento'}
            </DialogTitle>
            <DialogDescription>
              {action?.entry.description} ·{' '}
              {formatCents(action?.entry.amountCents || 0)}. Apenas registro
              financeiro; nenhuma transferência ou devolução bancária.
            </DialogDescription>
          </DialogHeader>
          {error && <p role='alert'>{error}</p>}
          {loadError && (
            <p role='alert'>
              {loadError} Volte para tentar carregar novamente.
            </p>
          )}
          {conflict && valid && (
            <Button disabled={busy} onClick={reviewConflict}>
              Revisar versão atual do lançamento
            </Button>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (!action) return
              const next = {
                ...action.entry,
                status:
                  action.kind === 'settle'
                    ? 'settled'
                    : action.kind === 'cancel'
                      ? 'cancelled'
                      : 'pending',
                settledDate: action.kind === 'settle' ? settledDate : '',
                paymentMethod: action.kind === 'settle' ? method : '',
              } as FinanceDraft
              if (await mutate([next], action.entry.id)) setAction(null)
            }}
          >
            {action?.kind === 'settle' ? (
              <fieldset disabled={disabled} className='finance-grid'>
                <Field id='finance-settled' label='Data da baixa'>
                  <Input
                    id='finance-settled'
                    type='date'
                    required
                    value={settledDate}
                    onChange={(e) => setSettledDate(e.target.value)}
                  />
                </Field>
                <Field id='finance-method' label='Forma de pagamento'>
                  <select
                    id='finance-method'
                    required
                    value={method}
                    onChange={(e) =>
                      setMethod(e.target.value as FinanceDraft['paymentMethod'])
                    }
                  >
                    <option value=''>Selecione</option>
                    {Object.entries(financeMethods).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </fieldset>
            ) : (
              <p>
                {action?.kind === 'reopen'
                  ? action.entry.status === 'cancelled'
                    ? 'Confirma a reabertura do lançamento cancelado? A conta voltará a pendente, preservando o histórico de auditoria. Nenhum estorno bancário será realizado.'
                    : 'Confirma o estorno do registro? A conta voltará a pendente e os dados de baixa serão limpos, preservando o histórico de auditoria.'
                  : 'Confirma o cancelamento? O lançamento será mantido no histórico, sem exclusão.'}
              </p>
            )}
            <History entry={action?.entry} />
            <div className='finance-actions'>
              <Button type='submit' disabled={disabled}>
                {action?.kind === 'settle'
                  ? 'Confirmar baixa'
                  : action?.kind === 'cancel'
                    ? 'Confirmar cancelamento'
                    : 'Confirmar reabertura'}
              </Button>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Voltar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
