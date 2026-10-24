import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { VerdantState } from './data'
import { djLineRows, validateDjOrder } from './dj-line'

export function DjLineEditor({
  data,
  eventId,
  update,
}: {
  data: VerdantState
  eventId: string
  update: (mutate: (s: VerdantState) => VerdantState) => Promise<boolean>
}) {
  const [rows, setRows] = useState(() => djLineRows(data, eventId))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  function numberRows() {
    const count = new Map<string, number>()
    setRows(
      rows.map((row) => {
        const track = row.track.trim().toLocaleLowerCase()
        const order = (count.get(track) || 0) + 1
        count.set(track, order)
        return { ...row, order }
      })
    )
  }
  async function save() {
    setMessage('')
    try {
      validateDjOrder(rows)
      setBusy(true)
      const saved = await update((state) => {
        for (const row of rows) {
          const before = data.people.find((p) => p.id === row.id),
            current = state.people.find((p) => p.id === row.id)
          if (
            !current?.eventIds.includes(eventId) ||
            JSON.stringify(before?.eventDetails[eventId]) !==
              JSON.stringify(current.eventDetails[eventId])
          )
            throw new Error(
              'A line foi alterada. Atualize o relatório antes de salvar.'
            )
        }
        return {
          ...state,
          people: state.people.map((p) => {
            const row = rows.find((r) => r.id === p.id)
            return row
              ? {
                  ...p,
                  eventDetails: {
                    ...p.eventDetails,
                    [eventId]: {
                      track: row.track.trim(),
                      order: row.order,
                      time: row.time.trim(),
                    },
                  },
                }
              : p
          }),
        }
      })
      setMessage(
        saved
          ? 'Line salva. O PDF e os vínculos do evento usam esta ordem.'
          : 'Não foi possível salvar. Atualize antes de tentar novamente.'
      )
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className='mb-4 rounded-lg border p-4'>
      <summary className='cursor-pointer font-semibold'>
        Organizar Line de DJs — ordem e horários
      </summary>
      <p>
        Defina 1, 2, 3… em cada pista e salve antes de imprimir. Os horários
        também podem indicar dois sets, por exemplo: 23:00 e 03:00.
      </p>
      {!rows.length ? (
        <p>
          Nenhum DJ vinculado a este evento. Faça o vínculo no cadastro de DJs.
        </p>
      ) : (
        <>
          <div className='overflow-x-auto'>
            <table>
              <thead>
                <tr>
                  <th>DJ</th>
                  <th>Pista</th>
                  <th>Ordem</th>
                  <th>Horário / sets</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>
                      <input
                        aria-label={`Pista de ${row.name}`}
                        disabled={busy}
                        value={row.track}
                        onChange={(e) =>
                          setRows(
                            rows.map((r) =>
                              r.id === row.id
                                ? { ...r, track: e.target.value }
                                : r
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Ordem de ${row.name}`}
                        type='number'
                        min='1'
                        step='1'
                        disabled={busy}
                        value={row.order || ''}
                        onChange={(e) =>
                          setRows(
                            rows.map((r) =>
                              r.id === row.id
                                ? { ...r, order: Number(e.target.value) }
                                : r
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Horários de ${row.name}`}
                        disabled={busy}
                        maxLength={100}
                        value={row.time}
                        onChange={(e) =>
                          setRows(
                            rows.map((r) =>
                              r.id === row.id
                                ? { ...r, time: e.target.value }
                                : r
                            )
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button disabled={busy} onClick={numberRows}>
            Numerar 1, 2, 3… por pista
          </Button>{' '}
          <Button disabled={busy} onClick={() => void save()}>
            Salvar line
          </Button>
        </>
      )}
      {message && <p role='status'>{message}</p>}
    </details>
  )
}
