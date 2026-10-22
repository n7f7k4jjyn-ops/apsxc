const CHAT_SOUND_KEY = 'verdant_chat_notification_sound'
let audioContext: AudioContext | null = null
let audioReady = false

export function isChatSoundEnabled() {
  try {
    return window.localStorage.getItem(CHAT_SOUND_KEY) === 'true'
  } catch {
    return false
  }
}

export function setChatSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(CHAT_SOUND_KEY, String(enabled))
  } catch {
    // The preference remains available for this page even when browser storage is blocked.
  }
  window.dispatchEvent(new CustomEvent('verdant:chat-sound-preference', { detail: enabled }))
}

export function prepareChatNotificationSound() {
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return
  try {
    audioContext ??= new AudioContextConstructor()
    if (audioContext.state === 'suspended') {
      void audioContext.resume().then(() => { audioReady = true }).catch(() => { audioReady = false })
    } else {
      audioReady = audioContext.state === 'running'
    }
  } catch {
    audioReady = false
  }
}

export function playChatNotificationSound() {
  if (!isChatSoundEnabled() || !audioReady || !audioContext || audioContext.state !== 'running') return
  try {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.12, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.18)
  } catch {
    // Keep the visual notification working if the browser cannot play audio.
  }
}
