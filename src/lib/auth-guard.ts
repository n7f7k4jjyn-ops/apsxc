import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'

export async function requireSession(destination: string) {
  const response = await fetch('/api/auth/session', {
    cache: 'no-store',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 401) {
    useAuthStore.getState().auth.reset()
    throw redirect({ to: '/sign-in', search: { redirect: destination } })
  }
  if (!response.ok)
    throw new Error('Não foi possível verificar sua sessão. Tente novamente.')
  const result = (await response.json()) as {
    user: { accountNo: string; email: string; role: string[]; exp: number }
  }
  useAuthStore.getState().auth.setUser(result.user)
}
