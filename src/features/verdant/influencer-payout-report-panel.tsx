import { FilterDateInput } from '@/components/filter-date-input'
import { sortRows, type SortDirection } from './data'
import { ColumnFilterControl, SortableTableHeader } from './list-controls'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { financeCsv, formatCents, type FinanceData } from './finance-data'
import {
  influencerPayoutRows,
  type PayoutAdmissions,
  type PayoutRow,
} from './influencer-payout-report'

export function InfluencerPayoutReportPanel({ eventId, from: sharedFrom, to: sharedTo }: { eventId?: string; from?: string; to?: string }) {
  const [localFrom, setFrom] = useState(''),
    [localTo, setTo] = useState('')
  const from = sharedFrom ?? localFrom, to = sharedTo ?? localTo
  const [rows, setRows] = useState<PayoutRow[]>()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [reportFinance, setReportFinance] = useState<FinanceData>()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<keyof PayoutRow>('date')
  const [direction, setDirection] = useState<SortDirection>('asc')
  const displayRows = sortRows((rows || []).filter(row => !query || `${row.event} ${row.date} ${row.influencer}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))), row => row[sortKey], direction)
  function toggle(key: typeof sortKey) { setDirection(sortKey === key && direction === 'asc' ? 'desc' : 'asc'); setSortKey(key) }
  const [reportKey, setReportKey] = useState('')
  const key = JSON.stringify([eventId, from, to])
  const current = reportKey === key && rows !== undefined
  function download(bytes: BlobPart, type: string, name: string) {
    const url = URL.createObjectURL(new Blob([bytes], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  async function generate() {
    setBusy(true)
    setError('')
    setRows(undefined)
    setReportFinance(undefined)
    try {
      async function get<T>(url: string): Promise<T> {
        const response = await fetch(url, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const value = await response.json()
        if (!response.ok)
          throw new Error(
            value.error || 'Falha ao carregar o relatório de repasses.'
          )
        return value
      }
      const [finance, admissions] = await Promise.all([
        get<FinanceData>('/api/finance'),
        get<PayoutAdmissions>('/api/finance/influencer-admissions'),
      ])
      const next = influencerPayoutRows(finance, admissions, {
        eventId,
        from,
        to,
      })
      setRows(next)
      setReportKey(key)
      setReportFinance(finance)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function downloadPdf() {
    if (!reportFinance) return
    setBusy(true); setError('')
    try {
      const { createPortariaPdf } = await import('./portaria-pdf')
      const bytes = await createPortariaPdf({
        eventName: eventId
          ? reportFinance!.events.find((e) => e.id === eventId)?.name ||
            'Evento selecionado'
          : 'Todos os eventos',
        eventDate:
          from || to
            ? `${from || 'Início'} a ${to || 'Fim'}`
            : 'Todas as datas',
        reportLabel: 'Repasse de influencers',
        sections: [
          {
            title: 'R$ 3 por entrada validada — não realiza pagamentos',
            groups: displayRows.map((row) => ({
              label: `${row.influencer} | ${row.date} | ${row.event}`,
              names: [
                `Inscrições: ${row.registered} | Entradas validadas: ${row.validated}`,
                `Validado: ${formatCents(row.earned)} | A gerar: ${formatCents(row.toGenerate)}`,
                `Pendente: ${formatCents(row.pending)} | Pago: ${formatCents(row.paid)} | Cancelado: ${formatCents(row.cancelled)}`,
              ],
            })),
          },
        ],
      })
      download(new Uint8Array(bytes), 'application/pdf', 'verdant-repasse-influencers.pdf')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Card className='finance-panel space-y-3 p-4'>
      <h3 className='text-lg font-semibold'>
        Relatório de repasse de influencers
      </h3>
      <p>
        Por evento, data e influencer. Inscrição sozinha não gera valor: cada
        entrada validada vale R$ 3. O período filtra a data do evento; a
        situação de pagamento é a atual.
      </p>
      <div className='flex flex-wrap gap-3'>
        <label>
          De{' '}
          <FilterDateInput label='De' value={from} disabled={busy || sharedFrom !== undefined} onValueChange={setFrom} className='h-11 rounded-md border bg-background px-3' />
        </label>
        <label>
          Até{' '}
          <FilterDateInput label='Até' value={to} disabled={busy || sharedTo !== undefined} onValueChange={setTo} className='h-11 rounded-md border bg-background px-3' />
        </label>
      </div>
      <Button disabled={busy} onClick={() => void generate()}>
        {busy
          ? 'Gerando relatório…'
          : 'Gerar relatório de repasse de influencers'}
      </Button>
      {error && <p role='alert'>{error}</p>}
      {current && (
        <>
          <p>
            {displayRows.length} combinações de evento e influencer. A pagar:{' '}
            {formatCents(
              displayRows.reduce((sum, row) => sum + row.pending + row.toGenerate, 0)
            )}
            . Pago: {formatCents(displayRows.reduce((sum, row) => sum + row.paid, 0))}
            .
          </p>
          {!displayRows.length && (
            <p>
              Nenhuma inscrição ou entrada validada para os filtros
              selecionados.
            </p>
          )}
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              disabled={!reportFinance || busy}
              onClick={() => void downloadPdf()}
            >
              Baixar PDF para imprimir
            </Button>
            <Button
              variant='outline'
              onClick={() =>
                download(
                  financeCsv(
                    [
                      'Data',
                      'Evento',
                      'Influencer',
                      'Inscrições',
                      'Entradas validadas',
                      'Validado (R$)',
                      'A gerar (R$)',
                      'Pendente (R$)',
                      'Pago (R$)',
                      'Cancelado (R$)',
                    ],
                    displayRows.map((row) => [
                      row.date,
                      row.event,
                      row.influencer,
                      row.registered,
                      row.validated,
                      ...[
                        row.earned,
                        row.toGenerate,
                        row.pending,
                        row.paid,
                        row.cancelled,
                      ].map((value) =>
                        (value / 100).toFixed(2).replace('.', ',')
                      ),
                    ])
                  ),
                  'text/csv;charset=utf-8',
                  'verdant-repasse-influencers.csv'
                )
              }
            >
              Exportar CSV
            </Button>
          </div>
          <div className='verdant-column-filter-bar'><ColumnFilterControl label='Evento / influencer' value={query} onChange={setQuery} /></div>
          <div className='overflow-x-auto'>
            <table className='verdant-table verdant-influencer-payout-table'>
              <thead>
                <tr>
                  <SortableTableHeader label='Data / evento' active={sortKey === 'date'} direction={direction} onClick={() => toggle('date')} />
                  <SortableTableHeader label='Influencer' active={sortKey === 'influencer'} direction={direction} onClick={() => toggle('influencer')} />
                  <SortableTableHeader label='Inscrições' active={sortKey === 'registered'} direction={direction} onClick={() => toggle('registered')} />
                  <SortableTableHeader label='Entradas' active={sortKey === 'validated'} direction={direction} onClick={() => toggle('validated')} />
                  <SortableTableHeader label='A gerar' active={sortKey === 'toGenerate'} direction={direction} onClick={() => toggle('toGenerate')} />
                  <SortableTableHeader label='Pendente' active={sortKey === 'pending'} direction={direction} onClick={() => toggle('pending')} />
                  <SortableTableHeader label='Pago' active={sortKey === 'paid'} direction={direction} onClick={() => toggle('paid')} />
                  <SortableTableHeader label='Cancelado' active={sortKey === 'cancelled'} direction={direction} onClick={() => toggle('cancelled')} />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={JSON.stringify([row.eventId, row.influencerId])}>
                    <td data-label='Data / evento'><span className='verdant-payout-event'><b>{row.event}</b><small>{row.date}</small></span></td>
                    <td data-label='Influencer'><span>{row.influencer}</span></td>
                    <td data-label='Inscrições'><span>{row.registered}</span></td>
                    <td data-label='Entradas'><span>{row.validated}</span></td>
                    <td data-label='A gerar'><span>{formatCents(row.toGenerate)}</span></td>
                    <td data-label='Pendente'><span>{formatCents(row.pending)}</span></td>
                    <td data-label='Pago'><span>{formatCents(row.paid)}</span></td>
                    <td data-label='Cancelado'><span>{formatCents(row.cancelled)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
