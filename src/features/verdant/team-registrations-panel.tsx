import { useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'

type Application = {
  id: string
  name: string
  whatsapp: string
  roles: string[]
  availability: string[]
  pixKey: string
  createdAt: string
}


const allowedRoles = ['Caixa', 'Bar', 'Limpeza', 'Segurança', 'Cozinha', 'Bombeiro']
const allowedDays = ['Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']

function parseCsv(text: string) {
  text = text.replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = [';', '\t', ','].reduce((best, item) => (firstLine.split(item).length > firstLine.split(best).length ? item : best), ',')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted && char === '"' && text[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (!quoted && char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function normalizedHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function brazilTimestamp(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return undefined
  const [, day, month, year, hour = '0', minute = '0', second = '0'] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) + 3, Number(minute), Number(second))).toISOString()
}

export function prepareImport(text: string) {
  const [header = [], ...rows] = parseCsv(text)
  const columns = header.map(normalizedHeader)
  const findColumn = (...parts: string[]) => columns.findIndex((value) => parts.some((part) => value.includes(part)))
  const dateIndex = findColumn('carimbo', 'data de cadastro', 'data')
  const nameIndex = findColumn('nome')
  const phoneIndex = findColumn('telefone', 'whatsapp', 'celular')
  const daysIndex = findColumn('dias', 'disponibilidade')
  const roleIndex = findColumn('setor', 'funcao', 'cargo', 'area')
  if ([nameIndex, phoneIndex, daysIndex, roleIndex].some((index) => index < 0)) {
    throw new Error('A planilha precisa ter as colunas: Nome, Telefone/WhatsApp, Dias disponíveis e Setor/Função.')
  }
  const people = new Map<string, { name: string; whatsapp: string; roles: string[]; availability: string[]; createdAt?: string }>()
  for (const values of rows) {
    const name = (values[nameIndex] || '').trim()
    const whatsapp = (values[phoneIndex] || '').replace(/\D/g, '')
    if (!name || !whatsapp) continue
    const key = `${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}|${whatsapp}`
    const person = people.get(key) || { name, whatsapp, roles: [], availability: [] }
    for (const role of allowedRoles) {
      if (normalizedHeader(values[roleIndex] || '').includes(normalizedHeader(role)) && !person.roles.includes(role)) person.roles.push(role)
    }
    const dayText = values[daysIndex] || ''
    for (const day of allowedDays) {
      if (normalizedHeader(dayText).includes(normalizedHeader(day.replace('-feira',''))) && !person.availability.includes(day)) person.availability.push(day)
    }
    const timestamp = dateIndex >= 0 ? brazilTimestamp(values[dateIndex] || '') : undefined
    if (timestamp && (!person.createdAt || timestamp > person.createdAt)) person.createdAt = timestamp
    people.set(key, person)
  }
  return [...people.values()].filter((person) => person.roles.length && person.availability.length)
}

export async function postTeamRecords(records: ReturnType<typeof prepareImport>) {
  let imported = 0
  let skipped = 0
  for (let start = 0; start < records.length; start += 400) {
    const response = await fetch('/api/team-registrations/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: records.slice(start, start + 400) }),
    })
    const result = (await response.json()) as { imported?: number; skipped?: number; error?: string }
    if (!response.ok) throw new Error(result.error || 'Não foi possível importar a planilha.')
    imported += result.imported || 0
    skipped += result.skipped || 0
  }
  return { imported, skipped }
}

function TeamRegistrationsContent() {
  const [open, setOpen] = useState(() => window.location.hash === '#equipe')
  const [applications, setApplications] = useState<Application[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function importCsv(file?: File) {
    if (!file) return
    setImporting(true)
    setError('')
    setImportResult('')
    try {
      const records = prepareImport(await file.text())
      if (!records.length) throw new Error('Nenhum cadastro válido foi encontrado na planilha.')
      const { imported, skipped } = await postTeamRecords(records)
      setImportResult(`${imported} cadastros importados; ${skipped} duplicados ignorados. Chaves Pix ficam pendentes de atualização.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao importar a planilha.')
    } finally {
      setImporting(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function load(nextOffset = 0) {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/team-registrations?offset=${nextOffset}`,
        { cache: 'no-store' }
      )
      const data = (await response.json()) as {
        applications: Application[]
        total: number
        error?: string
      }
      if (!response.ok)
        throw new Error(
          data.error || 'Não foi possível carregar as atualizações cadastrais.'
        )
      setApplications(data.applications)
      setTotal(data.total)
      setOffset(nextOffset)
    } catch (cause) {
      setApplications([])
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar as atualizações cadastrais.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <details
      id='equipe'
      className='verdant-form-group-accordion mb-5'
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open
        setOpen(next)
        if (next) void load()
      }}
    >
      <summary className='verdant-form-group-summary'>
        <div>
          <b>Equipe — Atualização cadastral</b>
          <p className='text-sm text-muted-foreground'>
            Atualizações cadastrais para avaliação interna da gestão
          </p>
        </div>
      </summary>
      {open && (
        <div className='verdant-form-group-body'>
          <div className='verdant-form-group-linkbar'>
            <code className='verdant-public-url'>
              connect.verdantcwb.com/equipe
            </code>
            <Button asChild variant='outline' size='sm'>
              <a href='/equipe' target='_blank' rel='noreferrer'>
                Abrir formulário
              </a>
            </Button>
          </div>
          <div className='my-3 flex flex-wrap items-center gap-3'>
            <input
              ref={fileInput}
              type='file'
              accept='.csv,text/csv'
              className='sr-only'
              aria-label='Selecionar planilha CSV da equipe'
              onChange={(event) => void importCsv(event.currentTarget.files?.[0])}
            />
            <Button variant='outline' size='sm' disabled={importing} onClick={() => fileInput.current?.click()}>
              {importing ? 'Importando…' : 'Importar planilha CSV'}
            </Button>
            <span className='text-xs text-muted-foreground'>Pix ficará pendente até a equipe atualizar o cadastro.</span>
          </div>
          {importResult && <p role='status' className='text-sm text-emerald-700'>{importResult}</p>}
          <div className='flex items-center justify-between gap-3'>
            <h3>{total} atualizações cadastrais</h3>
            <Button
              variant='outline'
              size='sm'
              disabled={loading}
              onClick={() => {
                void load(offset)
              }}
            >
              Atualizar
            </Button>
          </div>
          {loading ? (
            <p role='status'>Carregando atualizações cadastrais…</p>
          ) : error ? (
            <p role='alert' className='text-destructive'>
              {error}
            </p>
          ) : applications.length ? (
            <div className='verdant-table-wrap'>
              <table className='verdant-table'>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>WhatsApp</th>
                    <th>Funções</th>
                    <th>Disponibilidade</th>
                    <th>Chave Pix</th>
                    <th>Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((item) => (
                    <tr key={item.id}>
                      <td data-label='Nome'>{item.name}</td>
                      <td data-label='WhatsApp'>
                        <a
                          href={`https://wa.me/55${item.whatsapp}`}
                          target='_blank'
                          rel='noreferrer'
                        >
                          {item.whatsapp}
                        </a>
                      </td>
                      <td data-label='Funções'>
                        {item.roles.join(', ') || 'Não informado'}
                      </td>
                      <td data-label='Disponibilidade'>
                        {item.availability.join(', ') || 'Não informado'}
                      </td>
                      <td
                        data-label='Chave Pix'
                        className='whitespace-pre-wrap'
                      >
                        {item.pixKey}
                      </td>
                      <td data-label='Recebido'>
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'America/Sao_Paulo',
                        }).format(new Date(item.createdAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Ainda não há atualizações cadastrais recebidas.</p>
          )}
          <div className='flex items-center justify-end gap-3'>
            <Button
              variant='outline'
              size='sm'
              disabled={loading || offset === 0}
              onClick={() => {
                void load(Math.max(0, offset - 50))
              }}
            >
              Anterior
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={loading || offset + 50 >= total}
              onClick={() => {
                void load(offset + 50)
              }}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </details>
  )
}

export function TeamRegistrationsPanel() {
  const roles = useAuthStore((state) => state.auth.user?.role)
  return roles?.includes('admin') ? <TeamRegistrationsContent /> : null
}
