// Notification sound system — Web Audio API, no external files needed.

export type MakerSoundType =
  | 'order_received'  // new order arrived — ka-ching!
  | 'order_ready'     // order marked ready (confirmation)
  | 'message'         // new chat message
  | 'success'
  | 'warning'
  | 'error'

const SOUND_KEY = 'doornext_maker_sound_enabled'

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const v = localStorage.getItem(SOUND_KEY)
  return v === null ? true : v === 'true'
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SOUND_KEY, String(enabled))
}

let _ctx: AudioContext | null = null
let _unlocked = false

function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return _ctx
}

function tryUnlock() {
  if (_unlocked) return
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    _unlocked = true
  } catch { /* silent */ }
}

if (typeof window !== 'undefined') {
  const events = ['touchstart', 'touchend', 'click', 'keydown'] as const
  const handler = () => {
    tryUnlock()
    events.forEach(e => document.removeEventListener(e, handler, true))
  }
  events.forEach(e => document.addEventListener(e, handler, { capture: true, passive: true }))
}

interface Note { freq: number; start: number; dur: number; type: OscillatorType; gain: number; detune?: number }

const SOUNDS: Record<MakerSoundType, Note[]> = {
  // Ka-ching! Cash register — new order!
  order_received: [
    { freq: 1200, start: 0,    dur: 0.06, type: 'square', gain: 0.15 },
    { freq: 1600, start: 0.05, dur: 0.06, type: 'square', gain: 0.12 },
    { freq: 880,  start: 0.12, dur: 0.22, type: 'sine',   gain: 0.30 },
    { freq: 1760, start: 0.12, dur: 0.22, type: 'sine',   gain: 0.12 },
    { freq: 1047, start: 0.26, dur: 0.28, type: 'sine',   gain: 0.24 },
  ],

  // Completion bell — order marked ready
  order_ready: [
    { freq: 784,  start: 0,    dur: 0.30, type: 'sine',     gain: 0.28 },
    { freq: 784,  start: 0,    dur: 0.30, type: 'triangle', gain: 0.14, detune: 4 },
    { freq: 1047, start: 0.16, dur: 0.35, type: 'sine',     gain: 0.22 },
    { freq: 1568, start: 0.26, dur: 0.30, type: 'sine',     gain: 0.09 },
  ],

  // Soft bubble pop
  message: [
    { freq: 1200, start: 0,    dur: 0.06, type: 'sine', gain: 0.18 },
    { freq: 800,  start: 0.04, dur: 0.10, type: 'sine', gain: 0.22 },
    { freq: 1000, start: 0.12, dur: 0.08, type: 'sine', gain: 0.13 },
  ],

  success: [
    { freq: 659,  start: 0,    dur: 0.15, type: 'sine', gain: 0.22 },
    { freq: 880,  start: 0.12, dur: 0.20, type: 'sine', gain: 0.22 },
    { freq: 1047, start: 0.25, dur: 0.25, type: 'sine', gain: 0.18 },
  ],

  warning: [
    { freq: 440, start: 0,    dur: 0.15, type: 'triangle', gain: 0.28 },
    { freq: 415, start: 0,    dur: 0.15, type: 'triangle', gain: 0.14 },
    { freq: 440, start: 0.20, dur: 0.15, type: 'triangle', gain: 0.28 },
    { freq: 415, start: 0.20, dur: 0.15, type: 'triangle', gain: 0.14 },
  ],

  error: [
    { freq: 200, start: 0,    dur: 0.20, type: 'sawtooth', gain: 0.14 },
    { freq: 150, start: 0.20, dur: 0.30, type: 'sawtooth', gain: 0.16 },
  ],
}

const HAPTICS: Record<MakerSoundType, number[]> = {
  order_received: [20, 15, 20, 15, 50],
  order_ready:    [25, 15, 40],
  message:        [10, 10],
  success:        [15, 10, 25],
  warning:        [35, 25, 35],
  error:          [50, 30, 50],
}

export async function playSound(type: MakerSoundType, volume = 0.3): Promise<void> {
  if (!isSoundEnabled()) return
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    const notes = SOUNDS[type]
    const now = ctx.currentTime
    for (const note of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = note.type
      osc.frequency.value = note.freq
      if (note.detune) osc.detune.value = note.detune
      const t0 = now + note.start
      const peak = (note.gain * volume) / 0.3
      const attack = Math.min(0.01, note.dur * 0.1)
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(peak, t0 + attack)
      gain.gain.setValueAtTime(peak, t0 + note.dur * 0.6)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + note.dur)
      osc.start(t0)
      osc.stop(t0 + note.dur + 0.02)
    }
  } catch (e) {
    console.warn('[sound]', e)
  }
}

export async function playWithHaptic(type: MakerSoundType, volume = 0.3): Promise<void> {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(HAPTICS[type]) } catch { /* silent */ }
  }
  await playSound(type, volume)
}

export function initAudio(): void {
  try { getCtx() } catch { /* silent */ }
}
