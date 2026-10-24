import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { VerdantState } from './data'
import type { FinanceData } from './finance-data'
import {
  planProductionImport,
  readProductionBundle,
  type ImportedTeam,
  type ProductionEventBindings,
  type ProductionBundle,
} from './production-import'

async function api<T>(
  path: string,
  body?: unknown,
  method = 'POST'
): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || `Falha ${response.status}`)
  return value as T
}
async function snapshot() {
  const state = await api<VerdantState>('/api/state')
  const finance = await api<FinanceData>('/api/finance')
  const team: ImportedTeam[] = []
  for (let offset = 0; ; offset += 50) {
    const page = await api<{ records: ImportedTeam[]; total: number }>(
      `/api/registry/team?offset=${offset}`
    )
    team.push(...page.records)
    if (team.length >= page.total) break
    if (!page.records.length)
      throw new Error('A equipe mudou durante a consulta; atualize a prévia.')
  }
  return { state, team, finance }
}

export function ProductionImportPanel({
  onImported,
}: {
  onImported: () => void
}) {
  const [bundle, setBundle] = useState<ProductionBundle>()
  const [preview, setPreview] = useState<{
    plan: ReturnType<typeof planProductionImport>
    snapshot: Awaited<ReturnType<typeof snapshot>>
  }>()
  const [bindings, setBindings] = useState<ProductionEventBindings>({})
  const [createHistoricalEvents, setCreateHistoricalEvents] = useState(true)
  const [bindingChanges, setBindingChanges] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  async function review(input = bundle, eventBindings = bindings) {
    if (!input || lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    setPreview(undefined)
    try {
      const current = await snapshot()
      setPreview({
        plan: planProductionImport(
          input,
          current.state,
          current.team,
          current.finance,
          eventBindings,
          createHistoricalEvents
        ),
        snapshot: current,
      })
      setBindingChanges(false)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function apply() {
    if (!preview || bindingChanges || lock.current) return
    lock.current = true
    setBusy(true)
    try {
      const fresh = await snapshot()
      if (
        fresh.state.revision !== preview.snapshot.state.revision ||
        fresh.finance.revision !== preview.snapshot.finance.revision ||
        JSON.stringify(fresh.team) !== JSON.stringify(preview.snapshot.team)
      )
        throw new Error(
          'Os dados mudaram. Gere outra prévia antes de importar.'
        )
      const backup = await api<{ backup: string }>(
        '/api/finance/production-backup',
        {}
      )
      setMessage(`Backup criado: ${backup.backup}. Importando cadastros…`)
      const { plan } = preview
      await api('/api/state', plan.state, 'PUT')
      for (const person of plan.teamToCreate) {
        await api('/api/registry/team', {
          name: person.name,
          whatsapp: person.whatsapp,
          roles: person.roles,
          availability: person.availability,
          experience: person.experience,
        })
      }
      let revision = fresh.finance.revision,
        imported = 0
      for (let offset = 0; offset < plan.entries.length; offset += 500) {
        const result = await api<{ revision: number; imported: number }>(
          '/api/finance',
          { revision, entries: plan.entries.slice(offset, offset + 500) }
        )
        revision = result.revision
        imported += result.imported
      }
      setMessage(
        `Concluído: ${plan.newPeople} DJs, ${plan.newEvents} eventos históricos, ${plan.teamToCreate.length} funcionários e ${imported} lançamentos. Divergências ficaram fora da gravação financeira. Backup: ${backup.backup}.`
      )
      setPreview(undefined)
      onImported()
    } catch (e) {
      setMessage(
        `${(e as Error).message} A importação pode ter sido parcialmente gravada. Gere outra prévia para retomar sem repetir os registros já importados.`
      )
      setPreview(undefined)
      onImported()
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <Card className='finance-panel'>
      <h2>Importar produção e equipe</h2>
      <p>
        Selecione o pacote JSON consolidado. A prévia compara os cadastros e
        pagamentos existentes. Eventos e DJs novos entram inativos; a
        disponibilidade da equipe é histórica e precisa ser confirmada.
      </p>
      <label className='flex items-start gap-2'>
        <input
          type='checkbox'
          checked={createHistoricalEvents}
          disabled={busy}
          onChange={(event) => {
            setCreateHistoricalEvents(event.target.checked)
            setBindingChanges(true)
          }}
        />
        <span>
          Criar eventos históricos quando não houver correspondência de data e
          nome. Entram inativos, sem dados de conversão; eventos já reconhecidos
          são reutilizados. Confira os eventos previstos antes de importar.
        </span>
      </label>
      <label>
        Pacote de produção{' '}
        <input
          type='file'
          accept='.json,application/json'
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            setBindings({})
            setBindingChanges(false)
            setBundle(undefined)
            setPreview(undefined)
            setMessage('')
            if (!file) return
            try {
              if (file.size > 20 * 1024 * 1024)
                throw new Error('O pacote deve ter até 20 MB.')
              const input = readProductionBundle(JSON.parse(await file.text()))
              setBundle(input)
              await review(input, {})
            } catch (e) {
              setMessage((e as Error).message)
            }
          }}
        />
      </label>
      {preview && (
        <>
          <p>
            {preview.plan.newPeople} DJs novos · {preview.plan.newEvents}{' '}
            eventos · {preview.plan.teamToCreate.length} funcionários ·{' '}
            {preview.plan.entries.length} lançamentos · {preview.plan.skipped}{' '}
            já importados.
          </p>
          <p>
            {preview.plan.sourceReview} apresentações precisam de conciliação
            nas fontes; {preview.plan.issues.length} pendências de vínculo com o
            painel.
          </p>
          <p>
            Sem vencimento informado, foi usada a data da apresentação.
            Pagamentos históricos sem meio informado ficam em “Outro”. Confira
            essas premissas antes de gravar.
          </p>
          {!!preview.plan.issues.length && (
            <details>
              <summary>Ver pendências de vínculo</summary>
              <ul>
                {preview.plan.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
          {!!preview.plan.eventBindings.length && (
            <div className='grid gap-3 rounded-lg border p-3'>
              <h3>Vincular eventos existentes</h3>
              <p>
                Escolha o evento da mesma data. Eventos diferentes permanecem
                separados. Cada escolha vale para todas as apresentações e
                pagamentos desse evento.
              </p>
              {preview.plan.eventBindings.map((row) => (
                <label key={row.key} className='finance-field'>
                  {row.date} · {row.name}
                  <select
                    value={bindings[row.key] || ''}
                    onChange={(event) => {
                      setBindings((current) => ({
                        ...current,
                        [row.key]: event.target.value,
                      }))
                      setBindingChanges(true)
                    }}
                  >
                    <option value=''>Manter pendente</option>
                    {row.candidates.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <Button disabled={busy} onClick={() => void review()}>
                Atualizar prévia com os vínculos
              </Button>
            </div>
          )}
          {bindingChanges && (
            <Button disabled={busy} onClick={() => void review()}>
              Recalcular prévia da importação
            </Button>
          )}
          {bindingChanges && (
            <p role='status'>
              Atualize a prévia para aplicar os vínculos antes de importar.
            </p>
          )}
          <Button
            disabled={busy || bindingChanges}
            onClick={() => void apply()}
          >
            Criar backup e importar os registros conciliados
          </Button>
        </>
      )}
      {bundle && !preview && (
        <Button disabled={busy} onClick={() => void review()}>
          Gerar nova prévia
        </Button>
      )}
      {busy && (
        <p role='status'>
          Processando. Aguarde a conclusão antes de sair da página.
        </p>
      )}
      {message && <p role='status'>{message}</p>}
    </Card>
  )
}
