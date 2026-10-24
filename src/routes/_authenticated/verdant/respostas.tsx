import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/verdant/respostas')({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: `/verdant/inscricoes${location.searchStr}${location.hash ? `#${location.hash}` : ''}`,
      replace: true,
    })
  },
})
