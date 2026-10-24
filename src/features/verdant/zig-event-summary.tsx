import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { formatCents } from './finance-data'

type ListRow = { list: string; registered: number; came: number; conversionPercent: number | null }
type EventReport = {
  key: string; name: string; date: string; appEventName: string | null
  presentInHouse: number; registered: number | null; cameFromLists: number | null; conversionPercent: number | null; walkInsWithoutList: number | null
  lists: ListRow[]; salesAvailable: boolean
  totalCents: number; barCents: number; couvertCents: number; entranceCents: number; refundedCents: number
  excluded: { type: string; cents: number }[]
  avgTicketCents: number | null; avgBarCents: number | null; savedAt: string
}

const dash = '—'
const num = (value: number | null) => (value === null ? dash : value.toLocaleString('pt-BR'))
const pct = (value: number | null) => (value === null ? dash : `${value.toLocaleString('pt-BR')}%`)
const money = (value: number | null) => (value === null ? dash : formatCents(value))
const dateLabel = (value: string) => value.split('-').reverse().join('/')

export function ZigEventSummary() {
  const [reports, setReports] = useState<EventReport[] | null>(null)
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/finance/zig-reports', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { reports?: EventReport[]; error?: string }
        if (!response.ok) throw new Error(body.error || 'Não foi possível carregar o resumo.')
        if (active) setReports(body.reports ?? [])
      })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'Falha ao carregar o resumo.') })
    return () => { active = false }
  }, [])

  const visible = useMemo(() => (reports ?? []).filter((item) => (!from || item.date >= from) && (!to || item.date <= to)), [reports, from, to])
  const totals = useMemo(() => {
    const withLists = visible.filter((item) => item.registered !== null)
    const house = visible.reduce((sum, item) => sum + item.presentInHouse, 0)
    const total = visible.reduce((sum, item) => sum + item.totalCents, 0)
    const salesHouse = visible.filter((item) => item.salesAvailable).reduce((sum, item) => sum + item.presentInHouse, 0)
    const registered = withLists.reduce((sum, item) => sum + (item.registered ?? 0), 0)
    const came = withLists.reduce((sum, item) => sum + (item.cameFromLists ?? 0), 0)
    return {
      house, total, registered, came,
      conversion: registered ? Math.round((came / registered) * 1000) / 10 : null,
      ticket: salesHouse ? Math.round(total / salesHouse) : null,
      bar: visible.reduce((sum, item) => sum + item.barCents, 0),
      entrance: visible.reduce((sum, item) => sum + item.entranceCents + item.couvertCents, 0),
      withoutLists: visible.length - withLists.length,
    }
  }, [visible])

  if (error) return <p role='alert'>{error}</p>
  if (!reports) return <p role='status'>Carregando resumo…</p>

  const cards: [string, string][] = [
    ['Pessoas que entraram na casa', num(totals.house)],
    ['Inscritos nas listas', num(totals.registered)],
    ['Entraram pela lista', num(totals.came)],
    ['Conversão das listas', pct(totals.conversion)],
    ['Valor total do período', money(totals.total)],
    ['Ticket médio por pessoa', money(totals.ticket)],
    ['Bar e consumo', money(totals.bar)],
    ['Couvert e ingressos', money(totals.entrance)],
  ]

  return (
    <div>
      <p>
        Dados vindos da Zig e das listas, gravados em Apps → Zig → “Salvar resumo dos eventos”. Eventos antigos sem evento criado no app aparecem com público e receita da Zig; inscritos e conversão ficam com “—”, pois não há lista para cruzar. Ticket médio = receita (bar, couvert e ingressos) ÷ pessoas na casa; recargas, gorjetas e estornos ficam fora.
      </p>
      <div className='finance-grid'>
        <label>Data inicial<Input type='date' value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Data final<Input type='date' value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      {!reports.length && <p>Nenhum resumo salvo ainda.</p>}
      {reports.length > 0 && (
        <>
          <div className='finance-summary'>
            {cards.map(([label, value]) => (
              <div className='finance-panel' key={label}><h3>{label}</h3><strong>{value}</strong></div>
            ))}
          </div>
          {totals.withoutLists > 0 && <p>{totals.withoutLists} evento(s) sem evento no app: ficam fora de inscritos e conversão.</p>}
          <div className='finance-table'>
            <table>
              <thead>
                <tr>
                  <th>Evento</th><th>Data</th><th>Na casa</th><th>Inscritos</th><th>Pela lista</th><th>Conversão</th><th>Sem lista</th><th>Bar</th><th>Couvert/ingressos</th><th>Total</th><th>Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.key}>
                    <td>
                      {item.name}
                      {item.lists.length > 0 && <small> {item.lists.map((row) => `${row.list} ${row.came}/${row.registered}`).join(' · ')}</small>}
                      {item.excluded.length > 0 && <small> Fora da receita: {item.excluded.map((row) => `${row.type} ${formatCents(row.cents)}`).join(', ')}</small>}
                    </td>
                    <td>{dateLabel(item.date)}</td>
                    <td>{num(item.presentInHouse)}</td>
                    <td>{num(item.registered)}</td>
                    <td>{num(item.cameFromLists)}</td>
                    <td>{pct(item.conversionPercent)}</td>
                    <td>{num(item.walkInsWithoutList)}</td>
                    <td>{item.salesAvailable ? formatCents(item.barCents) : dash}</td>
                    <td>{item.salesAvailable ? formatCents(item.couvertCents + item.entranceCents) : dash}</td>
                    <td>{item.salesAvailable ? formatCents(item.totalCents) : dash}</td>
                    <td>{money(item.avgTicketCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
