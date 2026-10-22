import { createFileRoute } from '@tanstack/react-router'
import { VerdantPublicForm } from '@/features/verdant/public-form'

function PublicListPage() {
  const { slug } = Route.useParams()
  return <VerdantPublicForm slug={slug} />
}

export const Route = createFileRoute('/lista/$slug')({ component: PublicListPage })
