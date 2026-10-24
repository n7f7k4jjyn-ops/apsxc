import { describe, expect, it, vi } from 'vitest'
import { trackNavigation } from './analytics'

describe('navigation analytics', () => {
  it('emits vendor-neutral events without queries, fragments or unknown identifiers', () => {
    const listener = vi.fn()
    window.addEventListener('verdant:analytics', listener)
    try {
      trackNavigation('menu_click', '/verdant/agenda?email=private#secret', {
        destination: '/lista/private-token?name=private',
      })
      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0].detail).toEqual({
        event: 'menu_click',
        path: '/verdant/agenda',
        destination: '/lista/:slug',
      })
    } finally {
      window.removeEventListener('verdant:analytics', listener)
    }
  })

  it('never interrupts navigation if event delivery fails', () => {
    const dispatch = vi
      .spyOn(window, 'dispatchEvent')
      .mockImplementation(() => {
        throw new Error('unavailable')
      })
    try {
      expect(() => trackNavigation('page_view', '/')).not.toThrow()
    } finally {
      dispatch.mockRestore()
    }
  })
})
