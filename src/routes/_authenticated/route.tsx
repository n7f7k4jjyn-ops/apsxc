import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Sessão ausente')
      const result = await response.json() as { user: { accountNo: string; email: string; role: string[]; exp: number } }
      useAuthStore.getState().auth.setUser(result.user)
    } catch {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
  },
  component: AuthenticatedLayout,
})
