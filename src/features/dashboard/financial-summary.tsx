import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { FitValue } from '@/components/fit-value'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  financeReport,
  formatCents,
  type FinanceData,
} from '@/features/verdant/finance-data'
import { useVerdantStore } from '@/features/verdant/store'
import { ZigEventSummary } from '@/features/verdant/zig-event-summary'
import { SummaryDetail } from './summary-detail'
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
        ['Recebimentos realizados', report.incoming],
        ['Pagamentos realizados', report.outgoing],
        ['Resultado realizado do período', report.incoming - report.outgoing],
        ['Contas a pagar pendentes', report.payable],
      ] as const)
    : []
  return (
    <>
      <Header fixed className='verdant-summary-header'>
        <div className='min-w-0 flex-1'>
          <Search />
        </div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className='verdant-summary space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold sm:text-2xl'>Resumo financeiro</h1>
            <p className='text-sm text-muted-foreground'>
              Visão dos lançamentos registrados para o evento e período
              selecionados.
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
        {report && (
          <section
            aria-label='Indicadores financeiros'
            className='summary-finance-kpis grid grid-cols-2 gap-3 xl:grid-cols-4'
          >
            {figures.map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle className='text-sm'>{label}</CardTitle>
                </CardHeader>
                <CardContent className='font-bold'>
                  <FitValue value={formatCents(value)} maxSize={28} />
                </CardContent>
              </Card>
            ))}
          </section>
        )}
        <div className='grid gap-4 lg:grid-cols-2'>
          {report && (
            <SummaryDetail
              title='Saldos e pendências'
              description='Saldo registrado não equivale ao saldo bancário. Pendências usam a situação atual e a data de vencimento.'
              preview={`A receber: ${formatCents(report.receivable)} · consultar saldos`}
            >
              <dl className='grid gap-3 sm:grid-cols-2'>
                {[
                  ['Saldo inicial', report.opening],
                  ['Saldo registrado', report.balance],
                  ['Contas a pagar', report.payable],
                  ['Contas a receber', report.receivable],
                ].map(([label, value]) => (
                  <div key={label} className='min-w-0 rounded-lg border p-3'>
                    <dt className='text-sm'>{label}</dt>
                    <dd>
                      <FitValue
                        value={formatCents(Number(value))}
                        maxSize={24}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </SummaryDetail>
          )}
          {report && (
            <SummaryDetail
              title='Pagamentos por categoria'
              description='Pagamentos realizados no evento e período selecionados.'
              preview='Consultar equipe, DJs e influencers'
            >
              <dl className='grid gap-3 sm:grid-cols-3'>
                {[
                  ['Equipe paga', report.team],
                  ['DJs pagos', report.dj],
                  ['Influencers pagos', influencer],
                ].map(([label, value]) => (
                  <div key={label} className='min-w-0 rounded-lg border p-3'>
                    <dt className='text-sm'>{label}</dt>
                    <dd>
                      <FitValue
                        value={formatCents(Number(value))}
                        maxSize={24}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </SummaryDetail>
          )}
          <SummaryDetail
            title='Público e listas'
            description='Totais de inscrições do evento e envios no período; não representam entradas confirmadas na portaria.'
            preview='Consultar inscrições e envios recebidos'
          >
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
                    <FitValue
                      value={workflow.registrations.length.toLocaleString(
                        'pt-BR'
                      )}
                      maxSize={28}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Inscrições recebidas no período</CardTitle>
                  </CardHeader>
                  <CardContent className='text-2xl font-semibold'>
                    <FitValue
                      value={workflow.received.toLocaleString('pt-BR')}
                      maxSize={28}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </SummaryDetail>
          {report && previous && (
            <SummaryDetail
              title='Comparação entre períodos'
              description='Mesmo evento e intervalos com a mesma quantidade de dias. Pendências não reconstituem o saldo histórico.'
              preview='Consultar evolução dos recebimentos, pagamentos e pendências'
            >
              <Card className='space-y-3 p-4'>
                <p>
                  Atual: {from.split('-').reverse().join('/')} a{' '}
                  {to.split('-').reverse().join('/')} · Anterior:{' '}
                  {previousFrom.split('-').reverse().join('/')} a{' '}
                  {previousTo.split('-').reverse().join('/')} · Mesmo filtro de
                  evento, intervalos com {keys.length} dias.
                </p>
                <p className='text-sm text-muted-foreground'>
                  Pendências usam a situação atual e o vencimento; não
                  reconstituem o saldo pendente de uma data passada.
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
                          [
                            'Pendente a pagar',
                            previous.payable,
                            report.payable,
                          ],
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
            </SummaryDetail>
          )}
        </div>
        {connected && (focusId === 'all' || eventId) && (
          <SummaryDetail
            title='Conferência Zig'
            description='Dados da integração Zig para o evento e período selecionados.'
            preview='Consultar entradas e valores da integração'
          >
            <ZigEventSummary
              key={refresh}
              from={from}
              to={to}
              eventId={eventId}
            />
          </SummaryDetail>
        )}
        <details className='rounded-lg border p-3 text-sm text-muted-foreground'>
          <summary className='min-h-11 cursor-pointer'>
            Como ler os valores
          </summary>
          <p>
            Recebimentos e pagamentos usam a data da baixa. Contas pendentes
            usam o vencimento. Evento e período são os mesmos do resumo da
            operação.
          </p>
        </details>
        <Button asChild variant='outline'>
          <Link to='/verdant/financeiro'>Abrir lançamentos e pagamentos</Link>
        </Button>
      </Main>
    </>
  )
}
