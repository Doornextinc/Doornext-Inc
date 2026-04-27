// Notification sound system — Web Audio API, no external files needed.

export type CustomerSoundType =
  | 'order_confirmed'   // order placed & confirmed by maker
  | 'order_preparing'   // maker started preparing
  | 'driver_assigned'   // driver picked up the order
  | 'driver_arrived'    // driver arrived at your door
  | 'delivered'         // order delivered — celebration!
  | 'message'           // new message
  | 'success'
  | 'error'

const SOUND_KEY = 'doornext_customer_sound_enabled'

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

const SOUNDS: Record<CustomerSoundType, Note[]> = {
  // Ka-ching! — metallic register click + warm bell (order confirmed)
  order_confirmed: [
    { freq: 1200, start: 0,    dur: 0.06, type: 'square', gain: 0.14 },
    { freq: 1600, start: 0.05, dur: 0.06, type: 'square', gain: 0.11 },
    { freq: 880,  start: 0.12, dur: 0.22, type: 'sine',   gain: 0.30 },
    { freq: 1047, start: 0.26, dur: 0.28, type: 'sine',   gain: 0.22 },
  ],

  // Quick upward chirp — action underway
  order_preparing: [
    { freq: 349, start: 0,    dur: 0.08, type: 'square', gain: 0.14 },
    { freq: 523, start: 0.07, dur: 0.08, type: 'square', gain: 0.14 },
    { freq: 698, start: 0.14, dur: 0.14, type: 'sine',   gain: 0.24 },
  ],

  // Warm two-tone (driver assigned / on the way)
  driver_assigned: [
    { freq: 523,  start: 0,    dur: 0.15, type: 'sine', gain: 0.26 },
    { freq: 784,  start: 0.10, dur: 0.20, type: 'sine', gain: 0.26 },
    { freq: 1047, start: 0.22, dur: 0.30, type: 'sine', gain: 0.18 },
  ],

  // Doorbell — driver at your door
  driver_arrived: [
    { freq: 659, start: 0,    dur: 0.25, type: 'sine',     gain: 0.34 },
    { freq: 659, start: 0,    dur: 0.25, type: 'triangle', gain: 0.14, detune: 3 },
    { freq: 523, start: 0.30, dur: 0.36, type: 'sine',     gain: 0.34 },
    { freq: 523, start: 0.30, dur: 0.36, type: 'triangle', gain: 0.14, detune: 3 },
  ],

  // Celebratory fanfare — enjoy your meal!
  delivered: [
    { freq: 523,  start: 0,    dur: 0.12, type: 'sine',     gain: 0.28 },
    { freq: 659,  start: 0.10, dur: 0.12, type: 'sine',     gain: 0.28 },
    { freq: 784,  start: 0.20, dur: 0.12, type: 'sine',     gain: 0.28 },
    { freq: 1047, start: 0.30, dur: 0.40, type: 'sine',     gain: 0.33 },
    { freq: 1047, start: 0.30, dur: 0.40, type: 'triangle', gain: 0.13, detune: 5 },
    { freq: 1568, start: 0.36, dur: 0.34, type: 'sine',     gain: 0.10 },
  ],

  // Soft bubble pop
  message: [
    { freq: 1200, start: 0,    dur: 0.06, type: 'sine', gain: 0.18 },
    { freq: 800,  start: 0.04, dur: 0.10, type: 'sine', gain: 0.22 },
    { freq: 1000, start: 0.12, dur: 0.08, type: 'sine', gain: 0.13 },
  ],

  // Gentle upward chime
  success: [
    { freq: 659,  start: 0,    dur: 0.15, type: 'sine', gain: 0.22 },
    { freq: 880,  start: 0.12, dur: 0.20, type: 'sine', gain: 0.22 },
    { freq: 1047, start: 0.25, dur: 0.25, type: 'sine', gain: 0.18 },
  ],

  // Low descending error
  error: [
    { freq: 200, start: 0,    dur: 0.20, type: 'sawtooth', gain: 0.14 },
    { freq: 150, start: 0.20, dur: 0.30, type: 'sawtooth', gain: 0.16 },
  ],
}

const HAPTICS: Record<CustomerSoundType, number[]> = {
  order_confirmed:  [20, 15, 20, 15, 50],
  order_preparing:  [15, 10, 25],
  driver_assigned:  [25, 15, 40],
  driver_arrived:   [50, 40, 50],
  delivered:        [30, 20, 30, 20, 60],
  message:          [10, 10],
  success:          [15, 10, 25],
  error:            [50, 30, 50],
}

export async function playSound(type: CustomerSoundType, volume = 0.3): Promise<void> {
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

export async function playWithHaptic(type: CustomerSoundType, volume = 0.3): Promise<void> {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(HAPTICS[type]) } catch { /* silent */ }
  }
  await playSound(type, volume)
}

export function initAudio(): void {
  try { getCtx() } catch { /* silent */ }
}
