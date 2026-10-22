import { createFileRoute } from '@tanstack/react-router'
import { JobApplicationForm } from '@/features/verdant/job-application-form'

export const Route = createFileRoute('/trabalhe-conosco')({
  component: JobApplicationForm,
})
