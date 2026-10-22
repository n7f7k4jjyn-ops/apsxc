import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useLanguage } from '@/context/language-provider'
import { isChatSoundEnabled, playChatNotificationSound, prepareChatNotificationSound } from '@/lib/chat-notifications'

type IncomingMessage = { id: string; sender: string; senderName: string; message: string }
type Conversation = { id: string; messages: IncomingMessage[] }

export function ChatNotifications() {
  const user = useAuthStore((state) => state.auth.user)
  const { translate } = useLanguage()

  useEffect(() => {
    const roles = user?.role || []
    if (!roles.includes('admin') && !roles.includes('operator')) return

    let active = true
    let timer: number | undefined
    let initialized = false
    const seenMessageIds = new Set<string>()
    const prepareSoundAfterGesture = () => {
      if (isChatSoundEnabled()) prepareChatNotificationSound()
    }
    window.addEventListener('pointerdown', prepareSoundAfterGesture)
    window.addEventListener('keydown', prepareSoundAfterGesture)

    const checkForMessages = async () => {
      try {
        const response = await fetch('/api/chats', { credentials: 'same-origin', cache: 'no-store' })
        if (response.status === 401 || response.status === 403) {
          active = false
          return
        }
        if (!response.ok || !active) return
        const result = await response.json() as { currentUsername?: string; conversations?: Conversation[] }
        const currentUsername = String(result.currentUsername || '').toLowerCase()
        const conversations = result.conversations || []
        const incoming: IncomingMessage[] = []
        for (const conversation of conversations) {
          for (const message of conversation.messages || []) {
            if (initialized && message.sender.toLowerCase() !== currentUsername && !seenMessageIds.has(message.id)) {
              incoming.push(message)
            }
            seenMessageIds.add(message.id)
          }
        }
        initialized = true
        if (seenMessageIds.size > 2000) {
          const recentIds = [...seenMessageIds].slice(-1000)
          seenMessageIds.clear()
          recentIds.forEach((id) => seenMessageIds.add(id))
        }
        if (incoming.length) {
          playChatNotificationSound()
          for (const message of incoming.slice(-4)) {
            toast(translate('Nova mensagem recebida'), {
              description: `${message.senderName}: ${message.message.slice(0, 180)}`,
              action: {
                label: translate('Abrir chat'),
                onClick: () => window.location.assign('/chats'),
              },
            })
          }
        }
      } catch {
        // Polling is best-effort; the chat page reports load errors when opened.
      } finally {
        if (active) timer = window.setTimeout(() => { void checkForMessages() }, 10000)
      }
    }

    void checkForMessages()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener('pointerdown', prepareSoundAfterGesture)
      window.removeEventListener('keydown', prepareSoundAfterGesture)
    }
  }, [translate, user?.role, user?.username])

  return null
}
