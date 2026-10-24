import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { VerdantState } from './data'
import { applyDjLine, djLineRows, type DjLineRow } from './dj-line'

type EditableRow = DjLineRow & { originalId: string }
export function DjLineEditor({
  data,
  eventId,
  update,
}: {
  data: VerdantState
  eventId: string
  update: (mutate: (state: VerdantState) => VerdantState) => Promise<boolean>
}) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    djLineRows(data, eventId).map((row) => ({ ...row, originalId: row.id }))
  )
  const [track, setTrack] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const changed = rows.some((row) => row.id !== row.originalId)
  function patch(originalId: string, fields: Partial<EditableRow>) {
    setRows((current) =>
      current.map((row) =>
        row.originalId === originalId ? { ...row, ...fields } : row
      )
    )
    setReviewed(false)
  }
  async function save() {
    setBusy(true)
    setMessage('')
    try {
      if (changed && !reviewed)
        throw new Error(
          'Revise o cachê e o favorecido antes de confirmar a troca.'
        )
      const saved = await update((state) => {
        // Compare the entire linked line, including DJs added by another session.
        if (
          JSON.stringify(djLineRows(state, eventId)) !==
          JSON.stringify(djLineRows(data, eventId))
        )
          throw new Error('A line mudou. Atualize o relatório antes de salvar.')
        return applyDjLine(state, eventId, rows)
      })
      setMessage(
        saved
          ? 'Line salva. Inscrições e pagamentos anteriores permanecem vinculados ao DJ original.'
          : 'Não foi possível salvar. Atualize e tente novamente.'
      )
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const visible = rows.filter(
    (row) => !track || row.track.toUpperCase() === track
  )
  return (
    <details className='mb-4 rounded-lg border p-4'>
      <summary className='cursor-pointer font-semibold'>
        Organizar Line de DJs — pistas e horários
      </summary>
      <div className='my-3 flex flex-wrap gap-2'>
        {[
          ['', 'Todas as pistas'],
          ['SKY', 'SKY'],
          ['LAND', 'LAND'],
        ].map(([value, label]) => (
          <Button
            type='button'
            key={value}
            variant={track === value ? 'default' : 'outline'}
            onClick={() => setTrack(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className='mb-3 text-sm text-muted-foreground'>
        Cada pista possui sua própria ordem. Informe os dois sets separadamente.
        Horários antigos permanecem disponíveis para revisão.
      </p>
      {!rows.length ? (
        <p>Vincule os DJs no cadastro para montar a line.</p>
      ) : (
        <>
          <div className='overflow-x-auto'>
            <table className='verdant-table'>
              <thead>
                <tr>
                  <th>DJ / substituir</th>
                  <th>Pista</th>
                  <th>Ordem</th>
                  <th>Primeiro horário</th>
                  <th>Segundo horário</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.originalId}>
                    <td>
                      <select
                        aria-label={`DJ da posição de ${row.name}`}
                        value={row.id}
                        disabled={busy}
                        onChange={(event) => {
                          const person = data.people.find(
                            (item) => item.id === event.target.value
                          )
                          if (person)
                            patch(row.originalId, {
                              id: person.id,
                              name: person.name,
                            })
                        }}
                      >
                        {data.people
                          .filter(
                            (person) =>
                              person.kind === 'DJ' &&
                              (person.active || person.id === row.id)
                          )
                          .slice()
                          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                          .map((person) => (
                            <option
                              key={person.id}
                              value={person.id}
                              disabled={rows.some(
                                (other) =>
                                  other.originalId !== row.originalId &&
                                  other.id === person.id
                              )}
                            >
                              {person.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Pista de ${row.name}`}
                        value={row.track}
                        disabled={busy}
                        onChange={(event) =>
                          patch(row.originalId, { track: event.target.value })
                        }
                      >
                        <option value=''>Escolher pista</option>
                        {row.track && !['SKY', 'LAND'].includes(row.track) && (
                          <option value={row.track}>
                            {row.track} — revisar
                          </option>
                        )}
                        <option>SKY</option>
                        <option>LAND</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Ordem de ${row.name}`}
                        type='number'
                        min='1'
                        step='1'
                        value={row.order || ''}
                        disabled={busy}
                        onChange={(event) =>
                          patch(row.originalId, {
                            order: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Primeiro horário de ${row.name}`}
                        placeholder='23:00'
                        maxLength={100}
                        value={row.time}
                        disabled={busy}
                        onChange={(event) =>
                          patch(row.originalId, { time: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Segundo horário de ${row.name}`}
                        type='time'
                        value={row.secondTime || ''}
                        disabled={busy}
                        onChange={(event) =>
                          patch(row.originalId, {
                            secondTime: event.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {changed && (
            <div className='my-3 rounded-lg border p-3'>
              <p>
                A troca mantém posição e horários. O cachê e os lançamentos
                existentes continuam com o favorecido original. Revise as
                pendências no{' '}
                <a
                  className='underline'
                  href='/verdant/financeiro'
                  target='_blank'
                  rel='noreferrer'
                >
                  Financeiro
                </a>
                .
              </p>
              <label>
                <input
                  type='checkbox'
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />{' '}
                Revisei o cachê e os vínculos financeiros desta troca.
              </label>
            </div>
          )}
          <div className='mt-3 flex flex-wrap gap-2'>
            <Button
              disabled={busy}
              variant='outline'
              onClick={() => {
                const counts = new Map<string, number>()
                setRows((current) =>
                  current.map((row) => {
                    const key = row.track.toUpperCase()
                    const order = (counts.get(key) || 0) + 1
                    counts.set(key, order)
                    return { ...row, order }
                  })
                )
              }}
            >
              Numerar 1, 2, 3… por pista
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              Salvar line
            </Button>
          </div>
        </>
      )}
      {message && (
        <p role='status' className='mt-3'>
          {message}
        </p>
      )}
    </details>
  )
}
