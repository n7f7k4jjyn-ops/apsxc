import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { normalizeBrazilWhatsapp } from './data'
import { loadMetaPixel, trackPixelEvent } from './meta-pixel'
import { PublicShell } from './public-form'
import './verdant.css'

const roles = ['Caixa', 'Bar', 'Limpeza', 'Segurança', 'Cozinha', 'Bombeiro']
const days = ['Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']

export function JobApplicationForm() {
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  const [customLogo, setCustomLogo] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const submitting = useRef(false)
  const success = useRef<HTMLHeadingElement>(null)

  useEffect(() => { void loadMetaPixel() }, [])
  useEffect(() => {
    void fetch('/api/public/form-branding/trabalhe-conosco', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { logo: '' })
      .then((result: { logo?: string; description?: string }) => {
        setCustomLogo(result.logo || '')
        setCustomDescription(result.description || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.title = 'Faça parte da equipe Verdant'
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        'Cadastre seu interesse para oportunidades de trabalho eventual na Verdant, em Curitiba.'
      )
  }, [])
  useEffect(() => {
    if (complete) success.current?.focus()
  }, [complete])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const form = event.currentTarget
    const values = new FormData(form)
    const name = String(values.get('name') || '').trim()
    const whatsapp = normalizeBrazilWhatsapp(
      String(values.get('whatsapp') || '')
    )
    setError('')
    if (!name) return setError('Informe seu nome completo.')
    if (!whatsapp) return setError('Informe um telefone válido com DDD.')
    submitting.current = true
    setSaving(true)
    try {
      const response = await fetch('/api/public/job-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          whatsapp,
          roles: values.getAll('roles'),
          availability: values.getAll('availability'),
          experience: String(values.get('experience') || '').trim(),
        }),
      })
      const result = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok)
        throw new Error(
          result.error ||
            'Não foi possível enviar seu cadastro. Tente novamente.'
        )
      trackPixelEvent('Lead', { content_name: 'trabalhe-conosco' })
      setComplete(true)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível enviar seu cadastro. Verifique sua conexão e tente novamente.'
      )
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <PublicShell officialLogo customLogo={customLogo}>
      <div className='verdant-public-card'>
        <div className='verdant-pride-rule' />
        {complete ? (
          <div className='verdant-public-success' role='status'>
            <Check size={32} aria-hidden='true' />
            <h1 ref={success} tabIndex={-1}>
              Interesse cadastrado!
            </h1>
            <p>
              Seu cadastro foi recebido. Nossa equipe entrará em contato
              conforme a necessidade da casa e sua disponibilidade.
            </p>
            <p>O cadastro não garante uma chamada para trabalho.</p>
          </div>
        ) : (
          <>
            <div className='verdant-public-form-title'>
              <h1>Faça parte da equipe Verdant</h1>
            </div>
            <p className='verdant-public-description'>
              {customDescription || 'Cadastre seu interesse para oportunidades de trabalho eventual na Verdant. Nossa equipe entrará em contato conforme a necessidade da casa e sua disponibilidade.'}
            </p>
            <form
              className='verdant-public-form'
              onSubmit={(event) => {
                void submit(event)
              }}
            >
              <fieldset className='verdant-jobs-fields' disabled={saving}>
                <label>
                  <span>
                    Nome completo <span aria-hidden='true'>*</span>
                  </span>
                  <input
                    name='name'
                    autoComplete='name'
                    required
                    maxLength={160}
                    placeholder='Digite seu nome completo'
                  />
                </label>
                <label>
                  <span>
                    Telefone / WhatsApp com DDD{' '}
                    <span aria-hidden='true'>*</span>
                  </span>
                  <input
                    name='whatsapp'
                    type='tel'
                    inputMode='tel'
                    autoComplete='tel'
                    required
                    maxLength={50}
                    placeholder='(41) 99999-9999'
                  />
                </label>
                <fieldset className='verdant-jobs-choices'>
                  <legend>Em quais funções você tem interesse?</legend>
                  <p>Selecione uma ou mais opções.</p>
                  <div>
                    {roles.map((role) => (
                      <label key={role}>
                        <input type='checkbox' name='roles' value={role} />
                        <span>{role}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className='verdant-jobs-choices'>
                  <legend>Quais dias você tem disponibilidade?</legend>
                  <p>Selecione um ou mais dias.</p>
                  <div>
                    {days.map((day) => (
                      <label key={day}>
                        <input
                          type='checkbox'
                          name='availability'
                          value={day}
                        />
                        <span>{day}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>
                  Resumo da experiência profissional
                  <textarea
                    name='experience'
                    rows={5}
                    maxLength={4000}
                    placeholder='Conte brevemente suas experiências anteriores e as funções que já exerceu.'
                  />
                </label>
              </fieldset>
              {error && (
                <p role='alert' className='text-destructive'>
                  {error}
                </p>
              )}
              <Button type='submit' className='w-full' disabled={saving}>
                {saving ? 'Enviando cadastro…' : 'Cadastrar interesse'}
              </Button>
              <p className='verdant-jobs-disclaimer'>
                Nome e telefone são obrigatórios. O cadastro não garante uma
                chamada para trabalho.
              </p>
            </form>
          </>
        )}
      </div>
      <footer className='verdant-public-foot'>
        <div className='verdant-public-legal'>
          <span>© Verdant Curitiba · Direitos reservados</span>
          <nav aria-label='Links legais'>
            <a
              href='https://verdantcwb.com/politica-de-privacidade.html'
              target='_blank'
              rel='noreferrer'
            >
              Privacidade
            </a>
            <a
              href='https://verdantcwb.com/exclusao-de-dados.html'
              target='_blank'
              rel='noreferrer'
            >
              Exclusão de dados
            </a>
          </nav>
        </div>
      </footer>
    </PublicShell>
  )
}
