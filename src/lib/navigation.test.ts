import { describe, expect, it } from 'vitest'
import {
  getBreadcrumbs,
  getNavigationPage,
  isNavigationActive,
  navigationPages,
  safeRedirect,
} from './navigation'

describe('navigation metadata', () => {
  it('uses unique paths and links every parent to an existing page', () => {
    expect(new Set(navigationPages.map((page) => page.path)).size).toBe(
      navigationPages.length
    )
    for (const page of navigationPages) {
      if (page.parent)
        expect(
          navigationPages.some((parent) => parent.path === page.parent)
        ).toBe(true)
    }
  })

  it('matches pathname boundaries rather than queries or prefixes', () => {
    expect(isNavigationActive('/tasks/?status=pending#list', '/tasks')).toBe(
      true
    )
    expect(isNavigationActive('/tasks-archive', '/tasks')).toBe(false)
    expect(isNavigationActive('/settings/account', '/settings')).toBe(true)
    expect(isNavigationActive('/verdant/agenda', '/')).toBe(false)
    expect(isNavigationActive('/verdant/djs', '/verdant/cadastros')).toBe(true)
  })

  it('builds shallow breadcrumbs and does not expose dynamic identifiers', () => {
    expect(getBreadcrumbs('/verdant/djs').map((page) => page.title)).toEqual([
      'Resumo',
      'Cadastros',
      'DJs',
    ])
    expect(getNavigationPage('/lista/private-token?email=private')).toEqual({
      path: '/lista/:slug',
      title: 'Inscrição na lista',
    })
    expect(getNavigationPage('/unknown/private-token').path).toBe('/404')
  })
})

describe('safe login destinations', () => {
  it('preserves internal query parameters and fragments', () => {
    expect(safeRedirect('/verdant/inscricoes?event=123#lista')).toBe(
      '/verdant/inscricoes?event=123#lista'
    )
  })

  it.each([
    undefined,
    'https://outside.test',
    '//outside.test',
    '/\\outside.test',
    '/\noutside.test',
    '/sign-in?redirect=/tasks',
    '/foo/../sign-in',
  ])('rejects unsafe or looping destination %s', (value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})
