import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { FinanceData } from './finance-data'

type Admissions = {
  admissions: {
    id: string
    registrationId: string
    eventId: string
    guestName: string
    confirmedAt: string
  }[]
  registrations: {
    id: string
    name: string
    eventName: string
    eventDate: string
    influencer: string
  }[]
}
async function api<T>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...(payload === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Falha ao processar repasse.')
  return data as T
}
export function InfluencerCommissionsPanel({
  onChanged,
}: {
  onChanged: () => void
}) {
  const [data, setData] = useState<Admissions>()
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh() {
    setData(await api<Admissions>('/api/finance/influencer-admissions'))
  }
  useEffect(() => {
    let active = true
    void api<Admissions>('/api/finance/influencer-admissions')
      .then((value) => {
        if (active) setData(value)
      })
      .catch((e) => {
        if (active) setMessage(e.message)
      })
    return () => {
      active = false
    }
  }, [])
  async function confirm(registrationId: string) {
    setBusy(true)
    setMessage('')
    try {
      await api('/api/finance/influencer-admissions', { registrationId })
      await refresh()
      setMessage('Entrada confirmada. R$ 3 disponíveis para gerar o repasse.')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function generate() {
    setBusy(true)
    setMessage('')
    try {
      const finance = await api<FinanceData>('/api/finance')
      const result = await api<{ imported: number }>(
        '/api/finance/influencer-commissions',
        { revision: finance.revision }
      )
      setMessage(
        `${result.imported} repasses gerados. Cada entrada vale R$ 3; inscrições e entradas já lançadas não geram duplicação.`
      )
      onChanged()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const confirmed = new Set(data?.admissions.map((a) => a.registrationId))
  const visible =
    query.trim().length >= 2
      ? data?.registrations
          .filter((r) =>
            `${r.name} ${r.influencer} ${r.eventName} ${r.eventDate}`
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase())
          )
          .slice(0, 30) || []
      : []
  return (
    <Card className='finance-panel'>
      <h2>Repasses de influencers</h2>
      <p>
        R$ 3 por pessoa inscrita na lista, após entrada conferida na casa.
        Confirme somente após a portaria validar a entrada. Compra na Zig e
        inscrição não confirmam a entrada aqui.
      </p>
      <Input
        aria-label='Buscar inscrição de influencer por nome, evento ou data'
        placeholder='Busque nome, influencer, evento ou data'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={busy}
      />
      {!!visible.length && (
        <ul>
          {visible.map((r) => (
            <li key={r.id}>
              {r.name} · {r.influencer} · {r.eventDate} · {r.eventName}{' '}
              <Button
                disabled={busy || confirmed.has(r.id)}
                onClick={() => void confirm(r.id)}
              >
                {confirmed.has(r.id)
                  ? 'Entrada confirmada'
                  : 'Confirmar entrada conferida'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p>
        {data?.admissions.length || 0} entradas confirmadas. Pessoas em listas
        de influencers diferentes exigem resolução da atribuição antes do
        repasse.
      </p>
      <Button
        disabled={busy || !data?.admissions.length}
        onClick={() => void generate()}
      >
        Gerar R$ 3 por entrada ainda sem repasse
      </Button>
      {message && <p role='status'>{message}</p>}
    </Card>
  )
}
