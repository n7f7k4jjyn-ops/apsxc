import { create } from 'zustand'
import { toast } from 'sonner'
import type { VerdantState } from './data'

type Mutator = (state: VerdantState) => VerdantState

const blankState = (): VerdantState => ({ version: 2, revision: 0, updatedAt: '', events: [], forms: [], people: [], registrations: [] })

async function fetchState(): Promise<VerdantState | null> {
  try {
    const response = await fetch('/api/state', { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
    const result = (await response.json()) as VerdantState
    if (!Array.isArray(result.events) || !Array.isArray(result.forms) || !Array.isArray(result.people) || !Array.isArray(result.registrations) || !Number.isSafeInteger(result.revision)) return null
    return result
  } catch {
    return null
  }
}

type VerdantStore = {
  data: VerdantState
  ready: boolean
  serverConnected: boolean
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  update: (mutate: Mutator) => Promise<boolean>
}

let initialization: Promise<void> | null = null
let pollingTimer: number | undefined
let mutationQueue: Promise<void> = Promise.resolve()
let pendingMutations = 0

export const useVerdantStore = create<VerdantStore>((set, get) => ({
  data: blankState(),
  ready: false,
  serverConnected: false,

  initialize: async () => {
    if (initialization) return initialization
    initialization = (async () => {
      const remote = await fetchState()
      if (remote) set({ data: remote, ready: true, serverConnected: true })
      else set({ data: blankState(), ready: true, serverConnected: false })
      if (pollingTimer) window.clearInterval(pollingTimer)
      pollingTimer = window.setInterval(async () => {
        if (document.hidden) return
        const fresh = await fetchState()
        if (fresh) {
          if (pendingMutations === 0 && (!get().serverConnected || fresh.revision !== get().data.revision)) set({ data: fresh, serverConnected: true })
          else set({ serverConnected: true })
        } else if (pendingMutations === 0) set({ serverConnected: false })
      }, 5000)
    })()
    return initialization
  },

  refresh: async () => {
    const remote = await fetchState()
    if (remote) {
      if (pendingMutations === 0) set({ data: remote, ready: true, serverConnected: true })
    } else set({ serverConnected: false })
  },

  update: (mutate) => {
    if (!get().serverConnected) {
      toast.error('Servidor não conectado. Esta alteração não foi salva.', { duration: 10000 })
      return Promise.resolve(false)
    }
    pendingMutations += 1
    const operation = mutationQueue.catch(() => {}).then(async () => {
      if (!get().serverConnected) {
        toast.error('Servidor não conectado. Esta alteração não foi salva.', { duration: 10000 })
        return false
      }
      const previous = get().data
      const next = mutate(previous)
      next.revision = previous.revision
      next.updatedAt = new Date().toISOString()
      set({ data: next })
      let response: Response
      try {
        response = await fetch('/api/state', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        })
      } catch {
        set({ data: previous, serverConnected: false })
        toast.error('Falha ao sincronizar com o servidor. A alteração foi desfeita.', { duration: 10000 })
        return false
      }
      let result: (VerdantState & { error?: string; state?: VerdantState }) | null = null
      try {
        result = await response.json() as VerdantState & { error?: string; state?: VerdantState }
      } catch {
        // The HTTP status still identifies an API failure even if its body is not JSON.
      }
      if (response.status === 409) {
        if (result?.state && Number.isSafeInteger(result.state.revision)) set({ data: result.state, serverConnected: true })
        else set({ data: previous, serverConnected: true })
        toast.error(result?.error || 'Outra pessoa alterou os dados. Reaplique sua alteração.', { duration: 10000 })
        return false
      }
      if (!response.ok) {
        set({ data: previous, serverConnected: response.status !== 503 })
        const message = result?.error || `O servidor recusou a gravação (HTTP ${response.status}).`
        toast.error(`${message} A alteração foi desfeita.`, { duration: 10000 })
        return false
      }
      if (!result || !Number.isSafeInteger(result.revision)) {
        set({ data: previous, serverConnected: true })
        toast.error('O servidor retornou uma resposta inválida. A alteração foi desfeita.', { duration: 10000 })
        return false
      }
      set({ data: result, serverConnected: true })
      return true
    }).catch(() => {
      toast.error('Não foi possível preparar esta alteração.', { duration: 10000 })
      return false
    }).finally(() => {
      pendingMutations = Math.max(0, pendingMutations - 1)
    })
    mutationQueue = operation.then(() => undefined)
    return operation
  },
}))

