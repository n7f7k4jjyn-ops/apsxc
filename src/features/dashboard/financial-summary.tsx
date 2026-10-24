import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { buildWorkflow, periodKeys, type Period } from './workflow'

export function FinancialSummary({
  summarySwitch,
  period,
  focusId,
  now,
}: {
  summarySwitch: ReactNode
  period: Period
  focusId: string
  now: number
}) {
  const [data, setData] = useState<FinanceData>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const operation = useVerdantStore((state) => state.data)
  const connected = useVerdantStore((state) => state.serverConnected)
  const workflow = buildWorkflow(operation, now, period, focusId)
  const keys = periodKeys(now, period)
  const from = keys[0],
    to = keys[keys.length - 1]
  const eventId = workflow.event?.id || ''
  const activeIdsKey = JSON.stringify(workflow.events.map((e) => e.id))
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
  const result = useMemo(() => {
    if (!data || busy || !connected || (focusId !== 'all' && !eventId))
      return null
    try {
      return {
        report: financeReport(
          data.entries.filter(
            (entry) =>
              focusId !== 'all' ||
              (JSON.parse(activeIdsKey) as string[]).includes(entry.eventId)
          ),
          { from, to, eventId }
        ),
        error: '',
      }
    } catch (e) {
      return { report: null, error: (e as Error).message }
    }
  }, [data, busy, connected, focusId, from, to, eventId, activeIdsKey])
  const report = result?.report
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
      <Header fixed>
        <h1 className='text-lg font-semibold'>Resumo financeiro</h1>
      </Header>
      <Main className='space-y-4'>
        {summarySwitch}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-2xl font-bold'>Resumo financeiro</h2>
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
        <p className='text-sm text-muted-foreground'>
          Recebimentos e pagamentos usam a data da baixa. Contas pendentes usam
          o vencimento. Evento e período são os mesmos do resumo da operação.
        </p>
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
        {connected && (
          <div className='grid gap-3 sm:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>Inscritos no evento em foco</CardTitle>
              </CardHeader>
              <CardContent>{workflow.registrations.length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Inscrições recebidas no período</CardTitle>
              </CardHeader>
              <CardContent>{workflow.received}</CardContent>
            </Card>
          </div>
        )}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {figures.map(([label, value]) => (
            <Card key={label}>
              <CardHeader>
                <CardTitle className='text-sm'>{label}</CardTitle>
              </CardHeader>
              <CardContent className='text-2xl font-bold'>
                {formatCents(value)}
              </CardContent>
            </Card>
          ))}
        </div>
        {connected && (focusId === 'all' || eventId) && (
          <ZigEventSummary
            key={refresh}
            from={from}
            to={to}
            eventId={eventId}
            eventIds={
              focusId === 'all'
                ? (JSON.parse(activeIdsKey) as string[])
                : undefined
            }
          />
        )}
        <Button asChild variant='outline'>
          <Link to='/verdant/financeiro'>Abrir lançamentos e pagamentos</Link>
        </Button>
      </Main>
    </>
  )
}
