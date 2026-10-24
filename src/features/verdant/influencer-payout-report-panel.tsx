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
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; filename: string }>()
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
    setPdf(undefined)
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
      const { createPortariaPdf } = await import('./portaria-pdf')
      const bytes = await createPortariaPdf({
        eventName: eventId
          ? finance.events.find((e) => e.id === eventId)?.name ||
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
            groups: next.map((row) => ({
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
      setRows(next)
      setReportKey(key)
      setPdf({
        bytes: new Uint8Array(bytes),
        filename: 'verdant-repasse-influencers.pdf',
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
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
          <input
            type='date'
            value={from}
            disabled={busy || sharedFrom !== undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até{' '}
          <input
            type='date'
            value={to}
            disabled={busy || sharedTo !== undefined}
            onChange={(e) => setTo(e.target.value)}
          />
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
            {rows!.length} combinações de evento e influencer. A pagar:{' '}
            {formatCents(
              rows!.reduce((sum, row) => sum + row.pending + row.toGenerate, 0)
            )}
            . Pago: {formatCents(rows!.reduce((sum, row) => sum + row.paid, 0))}
            .
          </p>
          {!rows!.length && (
            <p>
              Nenhuma inscrição ou entrada validada para os filtros
              selecionados.
            </p>
          )}
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              disabled={!pdf}
              onClick={() =>
                pdf &&
                download(
                  new Uint8Array(pdf.bytes),
                  'application/pdf',
                  pdf.filename
                )
              }
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
                    rows!.map((row) => [
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
          <div className='overflow-x-auto'>
            <table>
              <thead>
                <tr>
                  <th>Data / evento</th>
                  <th>Influencer</th>
                  <th>Inscrições</th>
                  <th>Entradas</th>
                  <th>A gerar</th>
                  <th>Pendente</th>
                  <th>Pago</th>
                  <th>Cancelado</th>
                </tr>
              </thead>
              <tbody>
                {rows!.map((row) => (
                  <tr key={JSON.stringify([row.eventId, row.influencerId])}>
                    <td>
                      {row.date} · {row.event}
                    </td>
                    <td>{row.influencer}</td>
                    <td>{row.registered}</td>
                    <td>{row.validated}</td>
                    <td>{formatCents(row.toGenerate)}</td>
                    <td>{formatCents(row.pending)}</td>
                    <td>{formatCents(row.paid)}</td>
                    <td>{formatCents(row.cancelled)}</td>
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
