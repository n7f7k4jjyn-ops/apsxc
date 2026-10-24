import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type EventItem = { id: string; name: string; date: string; active: boolean }
type Report = { registrations: number; formsMoved: number; formsKept: string[]; people: number; keep: { name: string }; drop: { name: string } }
type MergeResult = { dryRun: boolean; report: Report; backup?: string; revision: number }

async function post(body: object): Promise<MergeResult> {
  const response = await fetch('/api/admin/events/merge', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = (await response.json().catch(() => ({}))) as MergeResult & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Não foi possível mesclar os eventos.')
  return result
}

export function EventMerge() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [keepId, setKeepId] = useState('')
  const [dropId, setDropId] = useState('')
  const [plan, setPlan] = useState<MergeResult | null>(null)
  const [revision, setRevision] = useState(0)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((state: { events: EventItem[]; revision: number } | null) => {
        if (!active || !state) return
        setEvents(state.events.filter((event) => event.active))
        setRevision(state.revision)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [reload])

  async function run(confirm: boolean) {
    setBusy(true)
    try {
      const result = await post({ keepId, dropId, confirm, revision })
      if (confirm) {
        toast.success(`Eventos mesclados. Backup: ${result.backup}`)
        setPlan(null)
        setKeepId('')
        setDropId('')
        setReload((n) => n + 1)
      } else {
        setPlan(result)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao mesclar.')
      setPlan(null)
    } finally {
      setBusy(false)
    }
  }

  const label = (event: EventItem) => `${event.name} (${event.date})`
  return (
    <div className='space-y-3 text-sm'>
      <p className='text-muted-foreground'>Reaponta inscrições, formulários e pessoas do evento mesclado para o evento mantido. Nada é apagado: o evento mesclado fica inativo e um backup é gravado antes.</p>
      <label className='block'>Manter este evento
        <select className='mt-1 w-full rounded-md border bg-background p-2' value={keepId} onChange={(e) => { setKeepId(e.target.value); setPlan(null) }}>
          <option value=''>Selecione</option>
          {events.map((event) => <option key={event.id} value={event.id}>{label(event)}</option>)}
        </select>
      </label>
      <label className='block'>Mesclar neste (ficará inativo)
        <select className='mt-1 w-full rounded-md border bg-background p-2' value={dropId} onChange={(e) => { setDropId(e.target.value); setPlan(null) }}>
          <option value=''>Selecione</option>
          {events.filter((event) => event.id !== keepId).map((event) => <option key={event.id} value={event.id}>{label(event)}</option>)}
        </select>
      </label>
      <Button type='button' variant='outline' disabled={busy || !keepId || !dropId} onClick={() => void run(false)}>Simular</Button>
      {plan && (
        <div className='rounded-md border p-3'>
          <p>{plan.report.registrations} inscrições, {plan.report.people} pessoas e {plan.report.formsMoved} formulários serão movidos para “{plan.report.keep.name}”.</p>
          {plan.report.formsKept.length > 0 && <p className='text-muted-foreground'>Formulários que já existem no evento mantido (os do evento mesclado serão desativados): {plan.report.formsKept.join(', ')}.</p>}
          <Button type='button' className='mt-2' disabled={busy} onClick={() => void run(true)}>Confirmar mesclagem</Button>
        </div>
      )}
    </div>
  )
}
