import { createFileRoute } from '@tanstack/react-router'
import { TeamRegistrationForm } from '@/features/verdant/team-registration-form'

export const Route = createFileRoute('/equipe')({
  component: TeamRegistrationForm,
})
