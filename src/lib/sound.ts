/**
 * Lightweight synthesized sound effects via the Web Audio API.
 * No asset files needed — every sound is generated on the fly. Respects a
 * global mute flag persisted in localStorage.
 */

let ctx: AudioContext | null = null
let muted = localStorage.getItem('lucky:muted') === '1'

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  localStorage.setItem('lucky:muted', value ? '1' : '0')
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.15,
  startOffset = 0,
): void {
  if (muted) return
  const audio = getCtx()
  if (!audio) return
  const now = audio.currentTime + startOffset
  const osc = audio.createOscillator()
  const env = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  env.gain.setValueAtTime(0, now)
  env.gain.linearRampToValueAtTime(gain, now + 0.01)
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(env)
  env.connect(audio.destination)
  osc.start(now)
  osc.stop(now + duration + 0.02)
}

function sweep(from: number, to: number, duration: number, gain = 0.12): void {
  if (muted) return
  const audio = getCtx()
  if (!audio) return
  const now = audio.currentTime
  const osc = audio.createOscillator()
  const env = audio.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(from, now)
  osc.frequency.exponentialRampToValueAtTime(to, now + duration)
  env.gain.setValueAtTime(gain, now)
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(env)
  env.connect(audio.destination)
  osc.start(now)
  osc.stop(now + duration + 0.02)
}

export const sfx = {
  click: () => tone(420, 0.06, 'triangle', 0.08),
  tick: () => tone(880, 0.03, 'square', 0.04),
  bet: () => tone(320, 0.08, 'sine', 0.1),
  reveal: () => tone(660, 0.07, 'triangle', 0.09),
  win: () => {
    tone(523.25, 0.12, 'triangle', 0.12, 0)
    tone(659.25, 0.12, 'triangle', 0.12, 0.1)
    tone(783.99, 0.22, 'triangle', 0.13, 0.2)
  },
  bigWin: () => {
    tone(523.25, 0.14, 'triangle', 0.14, 0)
    tone(659.25, 0.14, 'triangle', 0.14, 0.12)
    tone(783.99, 0.14, 'triangle', 0.14, 0.24)
    tone(1046.5, 0.32, 'triangle', 0.15, 0.36)
  },
  lose: () => tone(180, 0.25, 'sine', 0.1),
  explode: () => sweep(400, 60, 0.4, 0.18),
  cashout: () => {
    tone(659.25, 0.1, 'triangle', 0.12, 0)
    tone(987.77, 0.18, 'triangle', 0.12, 0.08)
  },
  spin: () => sweep(200, 600, 0.5, 0.06),
  card: () => tone(300, 0.05, 'square', 0.05),
  coin: () => {
    tone(880, 0.05, 'square', 0.06, 0)
    tone(1320, 0.08, 'square', 0.06, 0.04)
  },
}
