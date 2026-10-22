import { useEffect, useState, type FormEvent } from 'react'
import { Fragment } from 'react/jsx-runtime'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  ArrowLeft,
  Edit,
  Plus,
  Search as SearchIcon,
  Send,
  MessagesSquare,
  Volume2,
} from 'lucide-react'
import { cn, getDisplayNameInitials } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LocalizedText, useLanguage } from '@/context/language-provider'
import { isChatSoundEnabled, prepareChatNotificationSound, setChatSoundEnabled } from '@/lib/chat-notifications'
import { NewChat } from './components/new-chat'
import { type ChatUser, type Convo } from './data/chat-types'

type TeamMember = { username: string; displayName: string; email: string; active: boolean }
type TeamConversation = Omit<ChatUser, 'messages'> & { participantUsernames: string[]; updatedAt: string; messages: (Convo & { id: string; senderName: string })[] }

export function Chats() {
  const { language, translate } = useLanguage()
  const dateLocale = language === 'en' ? enUS : ptBR
  const [search, setSearch] = useState('')
  const [teamUsers, setTeamUsers] = useState<Omit<ChatUser, 'messages'>[]>([])
  const [conversations, setConversations] = useState<TeamConversation[]>([])
  const [currentUsername, setCurrentUsername] = useState('')
  const [chatLoading, setChatLoading] = useState(true)
  const [chatError, setChatError] = useState('')
  const [selectedUser, setSelectedUser] = useState<TeamConversation | null>(null)
  const [mobileSelectedUser, setMobileSelectedUser] = useState<TeamConversation | null>(
    null
  )
  const [createConversationDialogOpened, setCreateConversationDialog] =
    useState(false)
  const [messageDraft, setMessageDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [chatSoundEnabled, setChatSoundEnabledState] = useState(() => isChatSoundEnabled())

  useEffect(() => {
    const onSoundPreference = (event: Event) => setChatSoundEnabledState((event as CustomEvent<boolean>).detail)
    window.addEventListener('verdant:chat-sound-preference', onSoundPreference)
    return () => window.removeEventListener('verdant:chat-sound-preference', onSoundPreference)
  }, [])

  function changeChatSoundPreference(enabled: boolean) {
    setChatSoundEnabledState(enabled)
    setChatSoundEnabled(enabled)
    if (enabled) prepareChatNotificationSound()
  }

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const response = await fetch('/api/chats', { credentials: 'same-origin', cache: 'no-store' })
        const result = await response.json() as { currentUsername?: string; users?: TeamMember[]; conversations?: TeamConversation[]; error?: string }
        if (!response.ok) throw new Error(translate(result.error || 'Não foi possível carregar a equipe.'))
        if (!alive) return
        const nextConversations = result.conversations || []
        setCurrentUsername(result.currentUsername || '')
        setTeamUsers((result.users || []).map((user) => ({ id: user.username, profile: '', username: user.username, fullName: user.displayName, title: user.email || translate('Equipe') })))
        setConversations(nextConversations)
        setSelectedUser((current) => current ? nextConversations.find((conversation) => conversation.id === current.id) || current : current)
        setMobileSelectedUser((current) => current ? nextConversations.find((conversation) => conversation.id === current.id) || current : current)
      } catch (reason) {
        if (alive) setChatError(translate(reason instanceof Error ? reason.message : 'Não foi possível carregar as mensagens.'))
      } finally {
        if (alive) setChatLoading(false)
      }
    }
    void load()
    const refreshInterval = window.setInterval(() => { void load() }, 10000)
    return () => { alive = false; window.clearInterval(refreshInterval) }
  }, [translate])

  // Filtered data based on the search query
  const filteredChatList = conversations.filter(({ fullName }) =>
    fullName.toLowerCase().includes(search.trim().toLowerCase())
  )
  const filteredTeamUsers = teamUsers.filter(({ fullName, username }) => `${fullName} ${username}`.toLowerCase().includes(search.trim().toLowerCase()))

  const currentMessage = selectedUser?.messages.reduce<Record<string, TeamConversation['messages']>>(
    (acc, obj) => {
      const key = format(new Date(obj.timestamp), 'd MMM, yyyy', { locale: dateLocale })

      // Criar an array for the category if it doesn't exist
      if (!acc[key]) {
        acc[key] = []
      }

      // Push the current object to the array
      acc[key].push(obj)

      return acc
    },
    {}
  )

  async function createConversation(usernames: string[]) {
    setChatError('')
    try {
      const response = await fetch('/api/chats', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames }),
      })
      const result = await response.json() as { conversation?: TeamConversation; error?: string }
      if (!response.ok || !result.conversation) throw new Error(translate(result.error || 'Não foi possível iniciar a conversa.'))
      const conversation = result.conversation
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setSelectedUser(conversation)
      setMobileSelectedUser(conversation)
      setMessageDraft('')
      setCreateConversationDialog(false)
      return true
    } catch (reason) {
      setChatError(translate(reason instanceof Error ? reason.message : 'Não foi possível iniciar a conversa.'))
      return false
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = messageDraft.trim()
    if (!selectedUser || !message || sending) return
    setSending(true)
    setChatError('')
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(selectedUser.id)}/messages`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const result = await response.json() as { conversation?: TeamConversation; error?: string }
      if (!response.ok || !result.conversation) throw new Error(translate(result.error || 'Não foi possível enviar a mensagem.'))
      const conversation = result.conversation
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setSelectedUser(conversation)
      setMobileSelectedUser(conversation)
      setMessageDraft('')
    } catch (reason) {
      setChatError(translate(reason instanceof Error ? reason.message : 'Não foi possível enviar a mensagem.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <div className='min-w-0 flex-1'><Search /></div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <ThemeSwitch />
          <div className='hidden sm:block'><ConfigDrawer /></div>
          <ProfileDropdown />
        </div>
      </Header>

      <Main fixed>
        <section className='flex h-full gap-6'>
          {/* Left Side */}
          <div className='flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80'>
            <div className='sticky top-0 z-10 -mx-4 bg-background px-4 pb-3 shadow-md sm:static sm:z-auto sm:mx-0 sm:p-0 sm:shadow-none'>
              <div className='flex items-center justify-between py-2'>
                <div className='flex gap-2'>
                  <h1 className='text-2xl font-bold'>{<LocalizedText text="Mensagens" />}</h1>
                  <MessagesSquare size={20} />
                </div>

                <Button
                  size='icon'
                  variant='ghost'
                  onClick={() => setCreateConversationDialog(true)}
                  className='rounded-lg'
                >
                  <Edit size={24} className='stroke-muted-foreground' />
                </Button>
              </div>
              <div className='mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground'>
                <span className='flex items-center gap-2'><Volume2 size={15} /><LocalizedText text='Notificações do chat interno' /></span>
                <label className='flex cursor-pointer items-center gap-2'>
                  <span><LocalizedText text='Som' /></span>
                  <input type='checkbox' checked={chatSoundEnabled} onChange={(event) => changeChatSoundPreference(event.target.checked)} aria-label={translate('Ativar som para novas mensagens')} className='size-4 accent-emerald-700' />
                </label>
              </div>
              <p className='mb-2 text-xs text-muted-foreground'><LocalizedText text='Novas mensagens são verificadas a cada 10 segundos enquanto o painel está aberto.' /></p>

              <label
                className={cn(
                  'focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden',
                  'flex h-10 w-full items-center space-x-0 rounded-md border border-border ps-2'
                )}
              >
                <SearchIcon size={15} className='me-2 stroke-slate-500' />
                <span className='sr-only'><LocalizedText text='Buscar' /></span>
                <input
                  type='text'
                  className='w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden'
                  placeholder={translate('Buscar conversa...')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>

            <ScrollArea className='-mx-3 h-full overflow-scroll p-3'>
              {chatLoading && <p className='px-2 py-3 text-sm text-muted-foreground'>{<LocalizedText text='Carregando equipe…' />}</p>}
              {chatError && <p role='alert' className='px-2 py-2 text-sm text-destructive'>{chatError}</p>}
              {!chatLoading && !filteredChatList.length && <p className='px-2 py-3 text-xs text-muted-foreground'>{search ? translate('Nenhuma conversa encontrada.') : translate('Nenhuma conversa iniciada ainda.')}</p>}
              {filteredChatList.map((chatUsr) => {
                const { id, profile, username, messages, fullName } = chatUsr
                const lastConvo = messages[messages.length - 1]
                const lastMsg = !lastConvo ? translate('Iniciar conversa') : lastConvo.sender === currentUsername
                  ? `${translate('Você')}: ${lastConvo.message}`
                  : lastConvo.message
                return (
                  <Fragment key={id}>
                    <button
                      type='button'
                      className={cn(
                        'group hover:bg-accent hover:text-accent-foreground',
                        `flex w-full rounded-md px-2 py-2 text-start text-sm`,
                        selectedUser?.id === id && 'sm:bg-muted'
                      )}
                      onClick={() => {
                        setSelectedUser(chatUsr)
                        setMobileSelectedUser(chatUsr)
                      }}
                    >
                      <div className='flex gap-2'>
                        <Avatar>
                          <AvatarImage src={profile} alt={username} />
                          <AvatarFallback>
                            {getDisplayNameInitials(fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className='col-start-2 row-span-2 font-medium'>
                            {fullName}
                          </span>
                          <span className='col-start-2 row-span-2 row-start-2 line-clamp-2 text-ellipsis text-muted-foreground group-hover:text-accent-foreground/90'>
                            {lastMsg}
                          </span>
                        </div>
                      </div>
                    </button>
                    <Separator className='my-1' />
                  </Fragment>
                )
              })}
              <div className='px-2 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>{<LocalizedText text='Equipe' />}</div>
              {!chatLoading && !filteredTeamUsers.length && <p className='px-2 py-2 text-xs text-muted-foreground'>{<LocalizedText text='Nenhum outro membro ativo.' />}</p>}
              {filteredTeamUsers.map((member) => <button key={member.id} type='button' className='group flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground' onClick={() => void createConversation([member.username])}>
                <Avatar><AvatarFallback>{getDisplayNameInitials(member.fullName)}</AvatarFallback></Avatar>
                <span className='min-w-0'><b className='block truncate font-medium'>{member.fullName}</b><small className='block truncate text-muted-foreground group-hover:text-accent-foreground/90'>{member.username}</small></span>
                <Plus size={15} className='ms-auto shrink-0 text-muted-foreground' />
              </button>)}
            </ScrollArea>
          </div>

          {/* Right Side */}
          {selectedUser ? (
            <div
              className={cn(
                'absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col border bg-background shadow-xs sm:static sm:z-auto sm:flex sm:rounded-md',
                mobileSelectedUser && 'inset-s-0 flex'
              )}
            >
              {/* Top Part */}
              <div className='mb-1 flex flex-none justify-between bg-card p-4 shadow-lg sm:rounded-t-md'>
                {/* Left */}
                <div className='flex gap-3'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='-ms-2 h-full sm:hidden'
                    onClick={() => setMobileSelectedUser(null)}
                  >
                    <ArrowLeft className='rtl:rotate-180' />
                  </Button>
                  <div className='flex items-center gap-2 lg:gap-4'>
                    <Avatar className='size-9 lg:size-11'>
                      <AvatarImage
                        src={selectedUser.profile}
                        alt={selectedUser.username}
                      />
                      <AvatarFallback>
                        {getDisplayNameInitials(selectedUser.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className='col-start-2 row-span-2 text-sm font-medium lg:text-base'>
                        {selectedUser.fullName}
                      </span>
                      <span className='col-start-2 row-span-2 row-start-2 line-clamp-1 block max-w-32 text-xs text-nowrap text-ellipsis text-muted-foreground lg:max-w-none lg:text-sm'>
                        {selectedUser.title}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right */}
                <div className='-me-1 flex items-center gap-1 lg:gap-2'>
                </div>
              </div>

              {/* Conversation */}
              <div className='flex flex-1 flex-col gap-2 rounded-md px-4 pt-0 pb-4'>
                <div className='flex size-full flex-1'>
                  <div className='chat-text-container relative -me-4 flex flex-1 flex-col overflow-y-hidden'>
                    <div className='chat-flex flex h-40 w-full grow flex-col justify-start gap-4 overflow-y-auto py-2 pe-4 pb-4'>
                      {!selectedUser.messages.length && <p className='m-auto max-w-sm text-center text-sm text-muted-foreground'>{<LocalizedText text='Conversa iniciada. Envie a primeira mensagem para a equipe.' />}</p>}
                      {currentMessage &&
                        Object.keys(currentMessage).map((key) => (
                          <Fragment key={key}>
                            {currentMessage[key].map((msg, index) => (
                              <div
                                key={`${msg.sender}-${msg.timestamp}-${index}`}
                                className={cn(
                                  'chat-box max-w-72 px-3 py-2 wrap-break-word shadow-lg',
                                  msg.sender === currentUsername
                                    ? 'self-end rounded-[16px_16px_0_16px] bg-primary/90 text-primary-foreground/75'
                                    : 'self-start rounded-[16px_16px_16px_0] bg-muted'
                                )}
                              >
                                {msg.sender !== currentUsername && <span className='mb-1 block text-xs font-semibold'>{msg.senderName}</span>}
                                {msg.message}{' '}
                                <span
                                  className={cn(
                                    'mt-1 block text-xs font-light text-foreground/75 italic',
                                    msg.sender === currentUsername &&
                                      'text-end text-primary-foreground/85'
                                  )}
                                >
                                  {format(new Date(msg.timestamp), language === 'en' ? 'h:mm a' : 'HH:mm', { locale: dateLocale })}
                                </span>
                              </div>
                            ))}
                            <div className='text-center text-xs'>{key}</div>
                          </Fragment>
                        ))}
                    </div>
                  </div>
                </div>
                {chatError && <p role='alert' className='text-sm text-destructive'>{chatError}</p>}
                <form className='flex w-full flex-none gap-2' onSubmit={sendMessage}>
                  <div className='flex flex-1 items-center gap-2 rounded-md border border-input bg-card px-2 py-1 focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden lg:gap-4'>
                    <label className='flex-1'>
                      <span className='sr-only'>{<LocalizedText text="Campo de mensagem" />}</span>
                      <input
                        type='text'
                        value={messageDraft}
                        onChange={(event) => setMessageDraft(event.target.value)}
                        maxLength={2000}
                        placeholder='Digite sua mensagem...'
                        className='h-8 w-full bg-inherit focus-visible:outline-hidden'
                      />
                    </label>
                    <Button
                      type='submit'
                      variant='ghost'
                      size='icon'
                      disabled={sending || !messageDraft.trim()}
                      aria-label={translate('Enviar mensagem')}
                      className='hidden sm:inline-flex'
                    >
                      <Send size={20} />
                    </Button>
                  </div>
                  <Button type='submit' className='h-full sm:hidden' disabled={sending || !messageDraft.trim()}>
                    <Send size={18} /> <LocalizedText text='Enviar' />
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col justify-center rounded-md border bg-card shadow-xs sm:static sm:z-auto sm:flex'
              )}
            >
              <div className='flex flex-col items-center space-y-6'>
                <div className='flex size-16 items-center justify-center rounded-full border-2 border-border'>
                  <MessagesSquare className='size-8' />
                </div>
                <div className='space-y-2 text-center'>
                    <h1 className='text-xl font-semibold'>{<LocalizedText text="Mensagens da equipe" />}</h1>
                  <p className='text-sm text-muted-foreground'>{<LocalizedText text="Escolha um membro da equipe ao lado ou inicie uma conversa em grupo." leadingSpace trailingSpace />}</p>
                </div>
                <Button onClick={() => setCreateConversationDialog(true)}>{<LocalizedText text="Nova mensagem" leadingSpace trailingSpace />}</Button>
              </div>
            </div>
          )}
        </section>
        <NewChat
          users={teamUsers}
          onCreate={createConversation}
          onOpenChange={setCreateConversationDialog}
          open={createConversationDialogOpened}
        />
      </Main>
    </>
  )
}
