import { createFileRoute } from '@tanstack/react-router'
import { VerdantWorkspace } from '@/features/verdant'

export const Route = createFileRoute('/_authenticated/verdant/cadastros')({
  validateSearch: (
    search: Record<string, unknown>
  ): { category?: string; event?: string } => ({
    category: typeof search.category === 'string' ? search.category : undefined,
    event: typeof search.event === 'string' ? search.event : undefined,
  }),
  component: () => <VerdantWorkspace sectionName='cadastros' />,
})
