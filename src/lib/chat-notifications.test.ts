import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isChatSoundEnabled, setChatSoundEnabled } from './chat-notifications'

describe('chat notification sound preference', () => {
  beforeEach(() => localStorage.clear())

  it('is off by default and persists an explicit in-app choice', () => {
    expect(isChatSoundEnabled()).toBe(false)
    setChatSoundEnabled(true)
    expect(isChatSoundEnabled()).toBe(true)
    setChatSoundEnabled(false)
    expect(isChatSoundEnabled()).toBe(false)
  })

  it('announces preference changes to the current app tab', () => {
    const listener = vi.fn()
    window.addEventListener('verdant:chat-sound-preference', listener)
    setChatSoundEnabled(true)
    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0][0] as CustomEvent<boolean>).detail).toBe(true)
    window.removeEventListener('verdant:chat-sound-preference', listener)
  })
})
