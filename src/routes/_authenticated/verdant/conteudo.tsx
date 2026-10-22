import { createFileRoute } from '@tanstack/react-router'
import { ContentPlanner } from '@/features/content'

export const Route = createFileRoute('/_authenticated/verdant/conteudo')({
  component: ContentPlanner,
})
