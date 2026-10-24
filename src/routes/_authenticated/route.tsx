import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from '@/lib/auth-guard'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => requireSession(location.href),
  component: AuthenticatedLayout,
})
