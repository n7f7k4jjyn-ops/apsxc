import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { normalizeBrazilWhatsapp } from './data'
import { loadMetaPixel, trackTeamUpdate } from './meta-pixel'
import { PublicShell } from './public-form'
import './verdant.css'

const roles = ['Caixa', 'Bar', 'Limpeza', 'Segurança', 'Cozinha', 'Bombeiro']
const days = ['Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']

export function TeamRegistrationForm() {
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  const [customLogo, setCustomLogo] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const submitting = useRef(false)
  const success = useRef<HTMLHeadingElement>(null)

  useEffect(() => { void loadMetaPixel() }, [])
  useEffect(() => {
    void fetch('/api/public/form-branding/equipe', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { logo: '' })
      .then((result: { logo?: string; description?: string }) => {
        setCustomLogo(result.logo || '')
        setCustomDescription(result.description || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.title = 'Equipe Verdant — Atualização cadastral'
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        'Atualização cadastral e avaliação interna de quem já presta serviços na Verdant.'
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
    if (!String(values.get('pixKey') || '').trim())
      return setError('Informe sua chave Pix.')
    submitting.current = true
    setSaving(true)
    try {
      const response = await fetch('/api/public/team-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          whatsapp,
          roles: values.getAll('roles'),
          availability: values.getAll('availability'),
          pixKey: String(values.get('pixKey') || '').trim(),
        }),
      })
      const result = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok)
        throw new Error(
          result.error ||
            'Não foi possível enviar seu cadastro. Tente novamente.'
        )
      trackTeamUpdate()
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
              Atualização recebida!
            </h1>
            <p>
              Suas informações foram recebidas e serão analisadas pela gestão.
            </p>
            <p>
              O envio não confirma escala ou convocação para trabalho. Aguarde o
              contato da equipe.
            </p>
          </div>
        ) : (
          <>
            <div className='verdant-public-form-title'>
              <h1>Equipe Verdant — Atualização cadastral</h1>
            </div>
            <p className='verdant-public-description'>
              {customDescription || 'Este formulário é destinado a quem já presta serviços na Verdant. Atualize seus dados, informe as funções em que atua e sua disponibilidade. As informações serão utilizadas para atualização cadastral e avaliação interna da equipe.'}
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
                <label>
                  <span>
                    Chave Pix <span aria-hidden='true'>*</span>
                  </span>
                  <input
                    name='pixKey'
                    required
                    maxLength={254}
                    autoComplete='off'
                    spellCheck={false}
                    placeholder='Informe sua chave Pix'
                  />
                  <small>
                    Informe a chave Pix para recebimento dos pagamentos.
                  </small>
                </label>
                <fieldset className='verdant-jobs-choices'>
                  <legend>Em quais funções você atua na Verdant?</legend>
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
                  <legend>
                    Quais dias você tem disponibilidade para trabalhar?
                  </legend>
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
              </fieldset>
              {error && (
                <p role='alert' className='text-destructive'>
                  {error}
                </p>
              )}
              <Button type='submit' className='w-full' disabled={saving}>
                {saving ? 'Enviando cadastro…' : 'Atualizar cadastro'}
              </Button>
              <p className='verdant-jobs-disclaimer'>
                Nome, telefone e chave Pix são obrigatórios. Os demais campos
                são opcionais. O envio será analisado pela gestão e não confirma
                escala ou convocação para trabalho. Aguarde o contato da equipe.
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
