import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { FitValue } from '@/components/fit-value'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import {
  financeReport,
  formatCents,
  type FinanceData,
} from '@/features/verdant/finance-data'
import { useVerdantStore } from '@/features/verdant/store'
import { ZigEventSummary } from '@/features/verdant/zig-event-summary'
import {
  buildWorkflow,
  periodKeys,
  type Period,
  type DateRange,
} from './workflow'

export function FinancialSummary({
  summarySwitch,
  period,
  focusId,
  now,
  range,
}: {
  summarySwitch: ReactNode
  period: Period
  focusId: string
  now: number
  range?: DateRange
}) {
  const [data, setData] = useState<FinanceData>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const operation = useVerdantStore((state) => state.data)
  const connected = useVerdantStore((state) => state.serverConnected)
  const workflow = buildWorkflow(operation, now, period, focusId, range)
  const keys = periodKeys(now, period, range)
  const from = keys[0],
    to = keys[keys.length - 1]
  const eventId = workflow.event?.id || ''

  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/finance', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível carregar o resumo financeiro.')
        const value = (await response.json()) as FinanceData
        if (!Array.isArray(value.entries) || !Array.isArray(value.events))
          throw new Error('Resposta financeira inválida.')
        setData(value)
        setError('')
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(undefined)
          setError(e.message)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    return () => controller.abort()
  }, [refresh])
  const result = (() => {
    if (!data || busy || !connected || (focusId !== 'all' && !eventId))
      return null
    try {
      return {
        report: financeReport(data.entries, { from, to, eventId }),
        error: '',
      }
    } catch (e) {
      return { report: null, error: (e as Error).message }
    }
  })()
  const report = result?.report
  const previousTo = new Date(Date.parse(from + 'T12:00:00Z') - 86400000)
    .toISOString()
    .slice(0, 10)
  const previousFrom = new Date(
    Date.parse(from + 'T12:00:00Z') - keys.length * 86400000
  )
    .toISOString()
    .slice(0, 10)
  const previous = (() => {
    try {
      return report && data
        ? financeReport(data.entries, {
            from: previousFrom,
            to: previousTo,
            eventId,
          })
        : undefined
    } catch {
      return undefined
    }
  })()
  const influencer =
    report?.cash
      .filter((e) => e.type === 'payable' && e.category === 'influencer')
      .reduce((sum, e) => sum + e.amountCents, 0) || 0
  const figures = report
    ? ([
        ['Saldo inicial', report.opening],
        ['Recebimentos no período', report.incoming],
        ['Pagamentos no período', report.outgoing],
        ['Saldo registrado', report.balance],
        ['Contas a pagar', report.payable],
        ['Contas a receber', report.receivable],
        ['Equipe paga', report.team],
        ['DJs pagos', report.dj],
        ['Influencers pagos', influencer],
      ] as const)
    : []
  return (
    <>
      <Header fixed className='verdant-summary-header'><div className='min-w-0 flex-1'><Search /></div><div className='flex shrink-0 items-center gap-0.5'><ThemeSwitch /><ProfileDropdown /></div></Header>
      <Main className='verdant-summary space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold sm:text-2xl'>Resumo financeiro</h1>
            <p className='text-sm text-muted-foreground'>
              Valores dos lançamentos registrados. Saldo registrado não equivale
              ao saldo bancário.
            </p>
          </div>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setData(undefined)
              setRefresh((v) => v + 1)
            }}
          >
            Atualizar financeiro
          </Button>
        </div>
        {summarySwitch}
        <details className='rounded-lg border p-3 text-sm text-muted-foreground'><summary className='min-h-11 cursor-pointer'>Como ler os valores</summary><p>Recebimentos e pagamentos usam a data da baixa. Contas pendentes usam o vencimento. Evento e período são os mesmos do resumo da operação.</p></details>
        {!connected && (
          <p role='alert'>
            Aguardando sincronização dos eventos. Nenhum total financeiro foi
            confirmado.
          </p>
        )}
        {focusId !== 'all' && !eventId && (
          <p>
            Não há evento em foco. Selecione um evento ou todos os eventos
            ativos.
          </p>
        )}
        {busy && <p role='status'>Carregando financeiro…</p>}
        {(error || result?.error) && (
          <p role='alert'>{error || result?.error}</p>
        )}
        {report && ([['Receitas, despesas e pendências', figures.slice(0, 6)], ['Pagamentos por categoria', figures.slice(6)]] as const).map(([title, items]) => <section key={title} className='space-y-3'><h3 className='text-lg font-semibold'>{title}</h3><div className='grid grid-cols-2 gap-3 xl:grid-cols-3'>
          {items.map(([label, value]) => (
            <Card key={label}>
              <CardHeader>
                <CardTitle className='text-sm'>{label}</CardTitle>
              </CardHeader>
              <CardContent className='text-2xl font-bold'>
                <FitValue value={formatCents(value)} maxSize={28} />
              </CardContent>
            </Card>
          ))}
</div></section>)}
        <h3 className='text-lg font-semibold'>Público e listas</h3>
        {connected && (
          <div className='grid grid-cols-2 gap-3'>
            <Card>
              <CardHeader>
                <CardTitle>
                  {eventId
                    ? 'Inscritos no evento em foco'
                    : 'Inscritos dos eventos ativos'}
                </CardTitle>
              </CardHeader>
              <CardContent className='text-2xl font-semibold'>
                <FitValue value={workflow.registrations.length.toLocaleString('pt-BR')} maxSize={28} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Inscrições recebidas no período</CardTitle>
              </CardHeader>
              <CardContent className='text-2xl font-semibold'>
                <FitValue value={workflow.received.toLocaleString('pt-BR')} maxSize={28} />
              </CardContent>
            </Card>
          </div>
        )}
        {report && previous && (
          <Card className='space-y-3 p-4'>
            <h3 className='text-lg font-semibold'>Comparação entre períodos</h3>
            <p>
              Atual: {from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')} · Anterior: {previousFrom.split('-').reverse().join('/')} a {previousTo.split('-').reverse().join('/')} ·
              Mesmo filtro de evento, intervalos com {keys.length} dias.
            </p>
            <p className='text-sm text-muted-foreground'>
              Pendências usam a situação atual e o vencimento; não reconstituem
              o saldo pendente de uma data passada.
            </p>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr>
                    <th>Indicador</th>
                    <th>Anterior</th>
                    <th>Atual</th>
                    <th>Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Recebimentos', previous.incoming, report.incoming],
                      ['Pagamentos', previous.outgoing, report.outgoing],
                      ['Pendente a pagar', previous.payable, report.payable],
                      [
                        'Pendente a receber',
                        previous.receivable,
                        report.receivable,
                      ],
                    ] as const
                  ).map(([label, before, after]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{formatCents(before)}</td>
                      <td>{formatCents(after)}</td>
                      <td>{formatCents(after - before)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {connected && (focusId === 'all' || eventId) && (
          <ZigEventSummary
            key={refresh}
            from={from}
            to={to}
            eventId={eventId}
          />
        )}
        <Button asChild variant='outline'>
          <Link to='/verdant/financeiro'>Abrir lançamentos e pagamentos</Link>
        </Button>
      </Main>
    </>
  )
}
