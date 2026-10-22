import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Application = {
  id: string
  name: string
  whatsapp: string
  roles: string[]
  availability: string[]
  experience: string
  createdAt: string
}

export function JobApplicationsPanel() {
  const [open, setOpen] = useState(() => window.location.hash === '#vagas')
  const [applications, setApplications] = useState<Application[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(nextOffset = 0) {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/job-applications?offset=${nextOffset}`,
        { cache: 'no-store' }
      )
      const data = (await response.json()) as {
        applications: Application[]
        total: number
        error?: string
      }
      if (!response.ok)
        throw new Error(
          data.error || 'Não foi possível carregar as candidaturas.'
        )
      setApplications(data.applications)
      setTotal(data.total)
      setOffset(nextOffset)
    } catch (cause) {
      setApplications([])
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar as candidaturas.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <details
      id='vagas'
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
          <b>Trabalhe conosco</b>
          <p className='text-sm text-muted-foreground'>
            Oportunidades de trabalho eventual · candidaturas separadas das
            listas de eventos
          </p>
        </div>
      </summary>
      {open && (
        <div className='verdant-form-group-body'>
          <div className='verdant-form-group-linkbar'>
            <code className='verdant-public-url'>
              verdantcwb.com/trabalhe-conosco
            </code>
            <Button asChild variant='outline' size='sm'>
              <a href='/trabalhe-conosco' target='_blank' rel='noreferrer'>
                Abrir formulário
              </a>
            </Button>
          </div>
          <div className='flex items-center justify-between gap-3'>
            <h3>{total} candidaturas</h3>
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
            <p role='status'>Carregando candidaturas…</p>
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
                    <th>Experiência profissional</th>
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
                        data-label='Experiência profissional'
                        className='whitespace-pre-wrap'
                      >
                        {item.experience || 'Não informado'}
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
            <p>Ainda não há candidaturas recebidas.</p>
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
