import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ListRow = { list: string; registered: number; came: number; conversionPercent: number | null }
type ConversionEvent = {
  zigEventId: string; zigEventName: string; date: string; calculated: boolean; appEventName?: string
  registered?: number; came?: number; conversionPercent?: number | null; presentInHouse?: number; walkInsWithoutList?: number; lists?: ListRow[]
}
type Conversion = { events: ConversionEvent[]; notes: string[]; inconclusive: number; unconfirmedPresence: number; assumptions: string[] }
type SalesEvent = {
  eventId: string; eventName: string; eventDate: string; totalCents: number; refundedCents: number
  revenue: { type: string; label: string; cents: number; transactions: number }[]
  excluded: { type: string; cents: number }[]
}
type SalesPreview = {
  warnings: string[]; events: SalesEvent[]
  plan: { creates: number; unchanged: number; conflicts: { externalId: string; description: string; existingCents: number; zigCents: number }[] }
}
type SalesReport = { backup: string; created: number; unchanged: number; conflicts: unknown[] }

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const percent = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toLocaleString('pt-BR')}%`)

async function api<T>(route: string, body: object): Promise<T> {
  const response = await fetch(`/api/admin/zig/${route}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const result = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a consulta à Zig.')
  return result
}

export function ZigSalesConversion() {
  const [dtinicio, setDtinicio] = useState('')
  const [dtfim, setDtfim] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [conversion, setConversion] = useState<Conversion | null>(null)
  const [sales, setSales] = useState<SalesPreview | null>(null)
  const [report, setReport] = useState<SalesReport | null>(null)

  async function run<T>(name: string, action: () => Promise<T>) {
    setBusy(name)
    setError('')
    try { return await action() } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Falha ao consultar a Zig.')
      return null
    } finally { setBusy('') }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    setReport(null)
    if (submitter?.value === 'sales') {
      setSales(null)
      const result = await run('sales', () => api<{ preview: SalesPreview }>('sales/preview', { dtinicio, dtfim }))
      if (result) setSales(result.preview)
    } else {
      setConversion(null)
      const result = await run('conversion', () => api<{ conversion: Conversion }>('conversion', { dtinicio, dtfim }))
      if (result) setConversion(result.conversion)
    }
  }

  async function record() {
    if (!sales) return
    const text = `Lançar no Financeiro?\n\n• ${sales.plan.creates} receitas novas (já recebidas) serão criadas\n• ${sales.plan.unchanged} já existem e ficam como estão\n• Nada é apagado nem sobrescrito. Um backup do Financeiro é gerado antes.`
    if (!window.confirm(text)) return
    const result = await run('record', () => api<{ report: SalesReport }>('sales/apply', { dtinicio, dtfim, confirm: true, expected: { creates: sales.plan.creates } }))
    if (!result) return
    setReport(result.report)
    setSales(null)
    toast.success('Receita da Zig lançada no Financeiro.')
  }

  return (
    <form onSubmit={submit} className='space-y-3 rounded-md border p-3'>
      <h3 className='text-sm font-semibold'>Conversão das listas e caixa</h3>
      <p className='text-xs text-muted-foreground'>Use um evento já encerrado (no máximo 5 eventos). Conversão: quem se inscreveu nas listas e teve presença confirmada na Zig. Caixa: receita de bar, couvert e ingressos lançada no Financeiro como receita já recebida, com confirmação e backup. Recargas, gorjetas e estornos não entram como receita.</p>
      <div className='flex flex-wrap items-end gap-3'>
        <label className='space-y-1 text-sm font-medium'>Data inicial<Input type='date' value={dtinicio} onChange={(event) => setDtinicio(event.target.value)} required /></label>
        <label className='space-y-1 text-sm font-medium'>Data final<Input type='date' value={dtfim} onChange={(event) => setDtfim(event.target.value)} required /></label>
        <Button type='submit' value='conversion' disabled={busy !== ''}>{busy === 'conversion' ? 'Consultando…' : 'Calcular conversão'}</Button>
        <Button type='submit' value='sales' variant='outline' disabled={busy !== ''}>{busy === 'sales' ? 'Consultando…' : 'Prévia do caixa'}</Button>
      </div>
      {error && <p role='alert' className='text-sm text-destructive'>{error}</p>}

      {conversion && (
        <div className='space-y-3 text-sm'>
          {conversion.events.map((item) => (
            <div key={item.zigEventId} className='space-y-2 rounded border p-2'>
              <p className='font-medium'>{item.zigEventName || item.zigEventId} <span className='font-normal text-muted-foreground'>· {item.date}{item.appEventName ? ` · app: ${item.appEventName}` : ''}</span></p>
              {item.calculated ? (
                <>
                  <p>Inscritos: <b>{item.registered}</b> · Compareceram: <b>{item.came}</b> · Conversão: <b>{percent(item.conversionPercent)}</b> · Presentes na casa: {item.presentInHouse} · Sem lista: {item.walkInsWithoutList}</p>
                  <ul className='space-y-0.5 text-xs'>
                    {item.lists?.map((row) => <li key={row.list}>{row.list}: {row.came}/{row.registered} ({percent(row.conversionPercent)})</li>)}
                  </ul>
                </>
              ) : <p className='text-xs text-amber-700 dark:text-amber-300'>Conversão não calculada (não há um único evento do app nessa data).</p>}
            </div>
          ))}
          {conversion.notes.map((note) => <p key={note} className='text-xs text-amber-700 dark:text-amber-300'>{note}</p>)}
          <p className='text-xs text-muted-foreground'>Inconclusivos (ambíguos, não contam): {conversion.inconclusive} · Presença não confirmada: {conversion.unconfirmedPresence}.</p>
          <ul className='list-disc space-y-0.5 pl-5 text-xs text-muted-foreground'>{conversion.assumptions.map((text) => <li key={text}>{text}</li>)}</ul>
        </div>
      )}

      {sales && (
        <div className='space-y-3 text-sm'>
          {sales.events.map((item) => (
            <div key={item.eventId} className='space-y-1 rounded border p-2'>
              <p className='font-medium'>{item.eventName || item.eventId} <span className='font-normal text-muted-foreground'>· {item.eventDate}</span> · Total {money(item.totalCents)}</p>
              <ul className='space-y-0.5 text-xs'>
                {item.revenue.map((row) => <li key={row.type}>{row.label}: {money(row.cents)} ({row.transactions} transações)</li>)}
                {item.excluded.map((row) => <li key={row.type} className='text-muted-foreground'>Fora da receita ({row.type}): {money(row.cents)}</li>)}
                <li className='text-muted-foreground'>Estornados (não somados): {money(item.refundedCents)}</li>
              </ul>
            </div>
          ))}
          {sales.warnings.map((text) => <p key={text} className='text-xs text-amber-700 dark:text-amber-300'>{text}</p>)}
          {sales.plan.conflicts.map((row) => <p key={row.externalId} className='text-xs text-amber-700 dark:text-amber-300'>{row.description}: já lançado com {money(row.existingCents)}, a Zig agora informa {money(row.zigCents)}. Não foi alterado.</p>)}
          <p>Lançamentos novos: <b>{sales.plan.creates}</b> · Já existentes: {sales.plan.unchanged}</p>
          <Button type='button' disabled={busy !== '' || sales.plan.creates === 0} onClick={() => void record()}>{busy === 'record' ? 'Lançando…' : 'Lançar no Financeiro'}</Button>
        </div>
      )}
      {report && (
        <p role='status' className='rounded-md border border-emerald-300/60 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'>
          Lançado: {report.created} receitas novas, {report.unchanged} já existiam. Backup: {report.backup || 'não necessário'}.
        </p>
      )}
    </form>
  )
}
