import { createFileRoute } from '@tanstack/react-router'
import { VerdantWorkspace } from '@/features/verdant'

export const Route = createFileRoute('/_authenticated/verdant/agenda')({
  component: () => <VerdantWorkspace sectionName='agenda' />,
})
