import { createFileRoute } from '@tanstack/react-router'
import { VerdantPublicForm } from '@/features/verdant/public-form'

function PublicLoversPage() {
  return <VerdantPublicForm slug='lovers' />
}

export const Route = createFileRoute('/lovers')({ component: PublicLoversPage })
