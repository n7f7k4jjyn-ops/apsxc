import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCurrentLanguage, LocalizedText, useLanguage } from '@/context/language-provider'
import {
  configFor,
  eventById,
  FORM_DEFS,
  formatDate,
  isOpen,
  money,
  normalizeBrazilWhatsapp,
  publicProfessionalsForEvent,
  requiredFieldsFor,
  type FormKey,
  type FormConfig,
  type PublicPerson,
  type Registration,
  type VerdantEvent,
} from './data'
import './verdant.css'
import { loadMetaPixel, trackPixelEvent } from './meta-pixel'

const keyBySlug: Record<string, FormKey> = {
  djs: 'DJS',
  influencers: 'INFLUENCIADORES',
  lover: 'LISTA_LOVERS',
  lovers: 'LISTA_LOVERS',
  vip: 'VIP',
  aniversario: 'ANIVERSARIO',
  'entrada-gratuita': 'ENTRADA_GRATUITA',
}

function mondayOf(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day, 12))
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7))
  return value.toISOString().slice(0, 10)
}

function birthdayInEventWeek(birthday: string, eventDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return false
  const [birthYear, birthMonth, birthDay] = birthday.split('-').map(Number)
  const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay, 12))
  if (birthDate.toISOString().slice(0, 10) !== birthday) return false
  const eventYear = Number(eventDate.slice(0, 4))
  const monthDay = birthday.slice(4)
  return [eventYear - 1, eventYear, eventYear + 1].some((year) => {
    const candidate = String(year) + monthDay
    const [candidateYear, candidateMonth, candidateDay] = candidate.split('-').map(Number)
    const candidateDate = new Date(Date.UTC(candidateYear, candidateMonth - 1, candidateDay, 12))
    return candidateDate.toISOString().slice(0, 10) === candidate && mondayOf(candidate) === mondayOf(eventDate)
  })
}

function formatDeadline(date: string, cutoff: string) {
  if (!date || !cutoff) return 'A informar'
  return getCurrentLanguage() === 'en'
    ? `${formatDate(date, { weekday: 'long' })} at ${cutoff}`
    : `${formatDate(date, { weekday: 'long' })}, às ${cutoff}`
}

function formatRegistrationOpen(value: string) {
  if (!value) return 'A informar'
  const parsed = new Date(value.length === 16 ? `${value}:00-03:00` : value)
  return new Intl.DateTimeFormat(getCurrentLanguage(), { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(parsed)
}

function RequiredFieldLabel({ text, required }: { text: string; required: boolean }) {
  return (
    <span>
      <LocalizedText text={text} />
      {required && <><span aria-hidden='true' className='text-destructive'> *</span><span className='sr-only'><LocalizedText text='obrigatório' /></span></>}
    </span>
  )
}

export function VerdantPublicForm({ slug }: { slug: string }) {
  const { translate, language } = useLanguage()
  const key = keyBySlug[slug.toLowerCase()]
  const [data, setData] = useState<{ events: VerdantEvent[]; forms: FormConfig[]; people: PublicPerson[]; description?: string; logo?: string }>({ events: [], forms: [], people: [] })
  const [ready, setReady] = useState(false)
  const [serverConnected, setServerConnected] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [eventId, setEventId] = useState('')
  const [personId, setPersonId] = useState('')
  const [message, setMessage] = useState('')
  const [complete, setComplete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOnServer, setSavedOnServer] = useState(false)
  const [submissionSummary, setSubmissionSummary] = useState<{ eventName: string; eventDate: string; selection: string } | null>(null)
  const definition = FORM_DEFS.find((form) => form.key === key)

  useEffect(() => {
    if (!definition) return
    document.title = translate(definition.title)
    const description = document.querySelector('meta[name="description"]')
    if (description) description.setAttribute('content', data.description || definition.description)
  }, [data.description, definition, translate])

  useEffect(() => { void loadMetaPixel() }, [])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!key) { setReady(true); return }
      try {
        const response = await fetch(`/api/public/forms/${slug.toLowerCase()}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Serviço indisponível')
        const result = await response.json() as { events: VerdantEvent[]; forms: FormConfig[]; people: PublicPerson[]; description?: string; logo?: string }
        if (mounted) {
          setData(result)
          setServerConnected(true)
        }
      } catch {
        if (mounted) setServerConnected(false)
      } finally {
        if (mounted) setReady(true)
      }
    }
    void load()
    const refresh = window.setInterval(() => { void load() }, 20_000)
    const timer = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => { mounted = false; window.clearInterval(timer); window.clearInterval(refresh) }
  }, [key, slug])

  const availableEvents = useMemo(() => {
    if (!key) return []
    return data.events.filter((event) => isOpen(data, key, event.id, now)).sort((a, b) => a.date.localeCompare(b.date))
  }, [data, key, now])
  const event = eventById(data, eventId)
  const config = key && eventId ? configFor(data, key, eventId) : undefined
  const professionalKind = key === 'DJS' ? 'DJ' : key === 'INFLUENCIADORES' ? 'INFLUENCIADORES' : null
  const linkedOptions = professionalKind && event
    ? publicProfessionalsForEvent(data.people, professionalKind, event.id)
      .sort((a, b) => a.name.localeCompare(b.name, language === 'en' ? 'en' : 'pt-BR', { sensitivity: 'base' }))
    : []
  const options = linkedOptions

  async function onSubmit(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault()
    if (!key) return
    setMessage('')
    const form = eventSubmit.currentTarget
    const values = new FormData(form)
    const name = String(values.get('name') ?? '').trim()
    const whatsappInput = String(values.get('whatsapp') ?? '').trim()
    const whatsapp = whatsappInput ? normalizeBrazilWhatsapp(whatsappInput) : ''
    const email = String(values.get('email') ?? '').trim()
    const consentAnswer = String(values.get('consent') ?? '')
    const consent = consentAnswer === 'sim'
    const selectedEventId = String(values.get('eventId') ?? '')
    const currentEvent = eventById(data, selectedEventId)
    const currentConfig = currentEvent ? configFor(data, key, currentEvent.id) : undefined
    const requiredFields = requiredFieldsFor(currentConfig)
    if ((requiredFields.name || name) && name.length < 3) return setMessage('Informe seu nome completo.')
    if ((requiredFields.whatsapp || whatsappInput) && !whatsapp) return setMessage('Confira o WhatsApp com DDD. Use um número brasileiro válido, com DDD.')
    if ((requiredFields.email || email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage('Informe um e-mail válido.')
    if (requiredFields.consent && !consentAnswer) return setMessage('Escolha se aceita receber novidades.')
    if (!selectedEventId) return setMessage('Selecione o evento.')
    if (!currentEvent || !isOpen(data, key, selectedEventId)) return setMessage('As inscrições desta data encerraram ou ainda não abriram. Atualize a página e escolha outra opção.')

    let optionId = ''
    let optionName = ''
    let profileType = ''
    let birthdayDate = ''
    let guestNames: string[] = []
    if (key === 'DJS' || key === 'INFLUENCIADORES') {
      optionId = String(values.get('optionId') ?? '')
      const person = data.people.find((item) => item.id === optionId && item.eventIds.includes(selectedEventId))
      if (!person) return setMessage(language === 'en'
        ? `Select the ${key === 'DJS' ? 'DJ' : 'influencer'} linked to the selected date.`
        : `Selecione ${key === 'DJS' ? 'o DJ' : 'o Influencer'} associado à data escolhida.`)
      optionName = person.name
    }
    if (key === 'VIP') {
      profileType = String(values.get('profileType') ?? '')
      if (!['Pessoa trans', 'Artista Drag'].includes(profileType)) return setMessage('Selecione o tipo de inclusão.')
    }
    if (key === 'ANIVERSARIO') {
      birthdayDate = String(values.get('birthdayDate') ?? '')
      guestNames = values.getAll('guestNames').map((value) => String(value).trim()).filter(Boolean)
      if (!birthdayInEventWeek(birthdayDate, currentEvent.date)) return setMessage('O dia e mês do aniversário precisam cair na mesma semana do evento, de segunda a domingo.')
      if (!guestNames.length) return setMessage('Informe pelo menos um nome de convidado.')
      if (guestNames.length > (currentConfig?.maxGuests ?? 0)) return setMessage(language === 'en'
        ? `This form allows up to ${currentConfig?.maxGuests ?? 0} guests on this date.`
        : `Esta lista aceita até ${currentConfig?.maxGuests ?? 0} convidados nesta data.`)
      if (guestNames.some((guestName) => guestName.length > 120)) return setMessage(language === 'en'
        ? 'Each guest name can contain up to 120 characters.'
        : 'Cada nome de convidado pode ter até 120 caracteres.')
    }

    const registration: Omit<Registration, 'id' | 'createdAt' | 'status'> & { consentAnswered: boolean } = {
      formKey: key,
      eventId: currentEvent.id,
      eventName: currentEvent.name,
      eventDate: currentEvent.date,
      name,
      whatsapp,
      email,
      consent,
      consentAnswered: !!consentAnswer,
      optionId,
      optionName,
      profileType,
      birthdayDate,
      guestNames,
    }
    setSaving(true)
    try {
      const response = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(translate(result.error || 'Não foi possível concluir a inscrição.'))
      const selection = key === 'ANIVERSARIO'
        ? `${guestNames.length} ${language === 'en' ? 'guests' : 'convidados'}`
        : optionName || translate(profileType) || (key === 'LISTA_LOVERS' ? (language === 'en' ? 'Lover list' : 'Lista Lover') : key === 'ENTRADA_GRATUITA' ? (language === 'en' ? 'Free entry' : 'Entrada gratuita') : key)
      setSubmissionSummary({ eventName: currentEvent.name, eventDate: currentEvent.date, selection })
      setSavedOnServer(true)
      trackPixelEvent('Lead', { content_name: key })
      setComplete(true)
      form.reset()
      setEventId('')
      setPersonId('')
      const refreshed = await fetch(`/api/public/forms/${slug.toLowerCase()}`, { cache: 'no-store' })
      if (refreshed.ok) setData(await refreshed.json())
    } catch (error) {
      setMessage(translate(error instanceof Error ? error.message : 'Não foi possível concluir a inscrição.'))
    } finally {
      setSaving(false)
    }
  }

  if (!definition) {
    return <PublicShell><div className='verdant-public-card'><h1>{<LocalizedText text={"Formulário não encontrado"} />}</h1><p>{<LocalizedText text={"Confira o link enviado pela equipe Verdant."} />}</p></div></PublicShell>
  }

  return (
    <PublicShell listIcon={data.logo || definition.icon}>
      <div className='verdant-public-card'>
        <div className='verdant-pride-rule' />
        <div className='verdant-public-form-title'><h1>{translate(definition.title)}</h1></div>
        <p className='verdant-public-description'>{data.description || definition.description}</p>
        <p className='mb-3 text-xs text-muted-foreground'><span aria-hidden='true' className='text-destructive'>*</span> <LocalizedText text='Campo obrigatório' /></p>
        {complete ? (
          <div className='verdant-public-complete'><span className='check'><Check size={26} /></span><h2>{<LocalizedText text={"Inscrição recebida"} />}</h2><p><LocalizedText text={savedOnServer ? 'Sua resposta foi salva com segurança.' : 'Não foi possível confirmar o envio.'} /></p>{submissionSummary && <dl className='verdant-submission-summary'><div><dt><LocalizedText text='Evento' /></dt><dd>{submissionSummary.eventName}</dd></div><div><dt><LocalizedText text='Data' /></dt><dd>{formatDate(submissionSummary.eventDate, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</dd></div><div><dt><LocalizedText text='Opção escolhida' /></dt><dd>{submissionSummary.selection}</dd></div></dl>}<Button className='verdant-public-primary' onClick={() => { setComplete(false); setMessage('') }}>{<LocalizedText text={"Enviar outra resposta"} />}</Button></div>
        ) : (
          <form className='verdant-public-form' onSubmit={onSubmit}>
            {!serverConnected && ready && <div role='alert' className='verdant-public-alert'>{<LocalizedText text={"Formulário temporariamente indisponível. Tente novamente em alguns instantes."} />}</div>}
            <label className='verdant-field'><RequiredFieldLabel text='Nome completo' required={requiredFieldsFor(config).name} /><input name='name' autoComplete='name' maxLength={160} required={requiredFieldsFor(config).name} placeholder={translate('Seu nome completo')} /></label>
            <label className='verdant-field'><RequiredFieldLabel text='WhatsApp com DDD' required={requiredFieldsFor(config).whatsapp} /><input name='whatsapp' type='tel' autoComplete='tel' inputMode='tel' maxLength={22} required={requiredFieldsFor(config).whatsapp} placeholder='(41) 99999-9999' /></label>
            <label className='verdant-field'><RequiredFieldLabel text='E-mail' required={requiredFieldsFor(config).email} /><input name='email' type='email' autoComplete='email' required={requiredFieldsFor(config).email} placeholder={translate('voce@exemplo.com')} /></label>
            <div className='verdant-field verdant-choice-field' role='radiogroup'><RequiredFieldLabel text='Selecione o evento' required /><div className='verdant-consent-options verdant-choice-list'>{availableEvents.map((item) => <label key={item.id}><input type='radio' name='eventId' value={item.id} required checked={eventId === item.id} onChange={() => { setEventId(item.id); setPersonId('') }} />{formatDate(item.date, { weekday: 'long' })} · {item.name}</label>)}</div></div>
            {!ready && <div role='status' className='verdant-public-alert'>{<LocalizedText text={"Carregando datas disponíveis…"} />}</div>}
            {ready && serverConnected && !availableEvents.length && <div role='status' className='verdant-public-alert'>{<LocalizedText text={"Não há datas com inscrições abertas neste formulário agora. As demais listas e datas têm prazos independentes."} />}</div>}
            {event && config && <div className='verdant-event-info' aria-live='polite'>
              <div><span>{<LocalizedText text={"Data"} />}</span><b>{formatDate(event.date, { weekday: 'long', year: 'numeric' })}</b></div>
              <div><span><LocalizedText text='Valor da lista' /></span><b>{key === 'VIP' ? <LocalizedText text='Gratuito — VIP' /> : key === 'ANIVERSARIO' ? <LocalizedText text='Gratuito — aniversariante' /> : key === 'ENTRADA_GRATUITA' ? <LocalizedText text='Gratuito até 00h' /> : money(config.price)}{config.consumption ? ` ${translate('em consumação')}` : ''}</b></div>
              <div><span><LocalizedText text='Entrada pela lista' /></span><b>{key === 'VIP' ? config.openBarTime || translate('Após o Open Bar') : key === 'ENTRADA_GRATUITA' ? (language === 'en' ? 'Free entry until 00:00' : 'Entrada gratuita até 00h') : config.start && config.end ? `${config.start} ${language === 'en' ? 'to' : 'às'} ${config.end}` : translate('Conforme condição do evento')}</b></div>
              <div><span>{<LocalizedText text={"Inscrições abrem"} />}</span><b>{formatRegistrationOpen(config.openAt)}</b></div>
              <div><span>{<LocalizedText text={"Inscrições encerram"} />}</span><b>{formatDeadline(event.date, config.cutoff)}</b></div>
              {key === 'ANIVERSARIO' && <><div><span><LocalizedText text='Entrada do aniversariante' /></span><b><LocalizedText text='Gratuita, sem fila' /></b></div><div><span>{<LocalizedText text={"Convidados"} />}</span><b>{language === 'en' ? `Up to ${config.maxGuests} · ` : `Até ${config.maxGuests} · `}{config.guestPriceMode === 'PORTARIA' ? translate('valor de portaria') : `${money(config.guestPrice)} ${translate('em consumação')}`}</b></div></>}
              {event.eventTime && <div><span>{<LocalizedText text={"Evento"} />}</span><b>{event.eventTime}</b></div>}
            </div>}
            {key === 'DJS' && event && <div className='verdant-field verdant-choice-field' role='radiogroup'><RequiredFieldLabel text='Selecione o DJ' required /><div className='verdant-consent-options verdant-choice-list'>{options.map((person) => <label key={`${event.id}-${person.id}`} ><input type='radio' name='optionId' value={person.id} required checked={personId === person.id} onChange={() => setPersonId(person.id)} /><span>{person.name}{person.eventDetails[event.id]?.track ? ` · ${person.eventDetails[event.id].track}` : ''}</span></label>)}</div></div>}
            {key === 'INFLUENCIADORES' && event && <div className='verdant-field verdant-choice-field' role='radiogroup'><RequiredFieldLabel text='Selecione o Influencer' required /><div className='verdant-consent-options verdant-choice-list'>{options.map((person) => <label key={`${event.id}-${person.id}`} ><input type='radio' name='optionId' value={person.id} required checked={personId === person.id} onChange={() => setPersonId(person.id)} /><span>{person.name}</span></label>)}</div></div>}
            {key === 'INFLUENCIADORES' && event && !options.length && <div className='verdant-public-alert'>{<LocalizedText text={"A equipe ainda não vinculou Influencers a esta data."} />}</div>}
            {key === 'DJS' && event && !options.length && <div className='verdant-public-alert'>{<LocalizedText text={"A equipe ainda não vinculou DJs a esta data."} />}</div>}
            {key === 'VIP' && event && <label className='verdant-field'><RequiredFieldLabel text='Tipo de inclusão' required /><select name='profileType' required defaultValue=''><option value=''>{<LocalizedText text={"Selecione"} />}</option><option value='Pessoa trans'>{<LocalizedText text={"Pessoa trans"} />}</option><option value='Artista Drag'>{<LocalizedText text={"Artista Drag"} />}</option></select></label>}
            {key === 'ANIVERSARIO' && event && config && <><label className='verdant-field'><RequiredFieldLabel text='Data do aniversário' required /><input type='date' name='birthdayDate' required /></label><div className='verdant-guest-fields'><div className='verdant-guest-heading'><RequiredFieldLabel text='Nomes dos convidados' required /><small>{language === 'en' ? `Up to ${config.maxGuests} guests` : `Até ${config.maxGuests} convidados`}</small></div><div className='verdant-guest-inputs'>{Array.from({ length: config.maxGuests }, (_, index) => <label className='verdant-field' key={index}><span>{language === 'en' ? `Guest ${index + 1}` : `Convidado ${index + 1}`}</span><input type='text' name='guestNames' maxLength={120} aria-label={language === 'en' ? `Guest ${index + 1} name` : `Nome do convidado ${index + 1}`} /></label>)}</div></div>{config.guestPriceMode === 'PORTARIA' && config.birthdayRule && <div className='verdant-public-alert'>{config.birthdayRule}</div>}{config.skyConditions && <div className='verdant-public-alert'>{config.skyConditions}</div>}{config.acceptsCake && <div className='verdant-public-alert'>{<LocalizedText text={"Você pode levar um bolo e entregá-lo a um segurança para guardar na geladeira."} />}</div>}</>}
            {key === 'VIP' && event && <div className='verdant-public-alert'>{<LocalizedText text={"Artistas Drag devem estar montadas e produzidas no momento da entrada. A inclusão será validada pela equipe responsável."} />}</div>}
            {config?.extra && <div className='verdant-public-alert'>{config.extra}</div>}
            {config?.publicText && <div className='verdant-public-alert'>{config.publicText}</div>}
            <div className='verdant-field'><RequiredFieldLabel text='Aceita receber novidades?' required={requiredFieldsFor(config).consent} /><div className='verdant-consent-options'><label><input type='radio' name='consent' value='sim' required={requiredFieldsFor(config).consent} />{<LocalizedText text={"Sim"} leadingSpace />}</label><label><input type='radio' name='consent' value='nao' required={requiredFieldsFor(config).consent} />{<LocalizedText text={"Não"} leadingSpace />}</label></div></div>
            {message && <div role='alert' className='verdant-public-alert'>{translate(message)}</div>}
            <Button type='submit' className='w-full verdant-public-primary' disabled={saving || !ready || !serverConnected || (!!event && !isOpen(data, key, event.id))}>{saving ? <LocalizedText text='Enviando…' /> : <LocalizedText text='Enviar inscrição' />}</Button>
          </form>
        )}
      </div>
      <footer className='verdant-public-foot'>
        <div className='verdant-public-legal'><span>{<LocalizedText text={"© Verdant Curitiba · Direitos reservados"} />}</span><nav aria-label='Links legais'><a href='https://verdantcwb.com/politica-de-privacidade.html' target='_blank' rel='noreferrer'>{<LocalizedText text={"Privacidade"} />}</a><a href='https://verdantcwb.com/termos-de-uso.html' target='_blank' rel='noreferrer'>{<LocalizedText text={"Termos de uso"} />}</a><a href='https://verdantcwb.com/exclusao-de-dados.html' target='_blank' rel='noreferrer'>{<LocalizedText text={"Exclusão de dados"} />}</a></nav></div>
        <a className='verdant-public-scope' href='https://www.instagram.com/scope.deal' target='_blank' rel='noreferrer' aria-label='Desenvolvido por Scope Deal no Instagram'><span>{<LocalizedText text={"Desenvolvido por"} />}</span><img src='/images/scope-connect-colorida.webp' width={512} height={139} loading='lazy' decoding='async' alt='Scope Connect' /></a>
      </footer>
    </PublicShell>
  )
}

export function PublicShell({ children, listIcon, officialLogo = false, customLogo }: { children: React.ReactNode; listIcon?: string; officialLogo?: boolean; customLogo?: string }) {
  const { translate } = useLanguage()
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return window.localStorage.getItem('verdant-public-theme') === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  const light = theme === 'light'
  const toggleTheme = () => {
    const next = light ? 'dark' : 'light'
    setTheme(next)
    try { window.localStorage.setItem('verdant-public-theme', next) } catch { /* preference is optional */ }
  }

  const themeAction = translate(light ? 'Ativar tema escuro' : 'Ativar tema claro')
  const themeLabel = translate(light ? 'Tema escuro' : 'Tema claro')

  return <main className={`verdant-public verdant-public-${theme}`} data-theme={theme}><div className='verdant-public-shell'><div className='verdant-public-header'><div className='verdant-public-brand'>{listIcon && <img className='verdant-public-list-icon' src={listIcon} width={56} height={56} decoding='async' alt='' />}{customLogo ? <img className='verdant-public-official-logo' src={customLogo} width={512} height={512} fetchPriority='high' decoding='async' alt='Logo do formulário' /> : officialLogo ? <img className='verdant-public-official-logo' src={light ? '/images/verdant-official-black.png' : '/images/verdant-official-white.png'} width={2048} height={1170} fetchPriority='high' decoding='async' alt='Verdant' /> : <img className='verdant-public-wordmark' src='/images/verdant-wordmark-colorida.webp' width={640} height={160} fetchPriority='high' decoding='async' alt='Verdant' />}<small>{<LocalizedText text={"Curitiba · Paraná"} />}</small></div><div className='flex items-center gap-2'><button type='button' className='verdant-public-theme-toggle' onClick={toggleTheme} aria-label={themeAction} aria-pressed={light} title={themeAction}>{light ? <Moon size={16} aria-hidden='true' /> : <Sun size={16} aria-hidden='true' />}<span>{themeLabel}</span></button></div></div>{children}</div></main>
}

