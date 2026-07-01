/**
 * Lightweight synthesized sound effects via the Web Audio API.
 *
 * No asset files — every sound is generated on the fly from oscillators and a
 * shared white-noise buffer, routed through a master gain + compressor so
 * nothing ever clips or stings. Sounds are designed to be subtle and
 * *contextual* (cards "flick", chips "clink", reels "whoosh", wins chime).
 * Respects a global mute flag persisted in localStorage.
 */

const MASTER_GAIN = 0.8

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = localStorage.getItem('jacasino:muted') === '1'
let volume = readVolume()

function readVolume(): number {
  const raw = localStorage.getItem('jacasino:volume')
  if (raw === null) return 0.7
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.7
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      // Master chain: everything → gain → soft compressor → speakers.
      master = ctx.createGain()
      master.gain.value = MASTER_GAIN * volume
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.knee.value = 24
      comp.ratio.value = 12
      comp.attack.value = 0.003
      comp.release.value = 0.18
      master.connect(comp)
      comp.connect(ctx.destination)
      // 1s of white noise reused by all noise-based sounds.
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
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
  localStorage.setItem('jacasino:muted', value ? '1' : '0')
}

export function getVolume(): number {
  return volume
}

export function setVolume(value: number): void {
  volume = Math.min(1, Math.max(0, value))
  localStorage.setItem('jacasino:volume', String(volume))
  if (master && ctx) master.gain.setTargetAtTime(MASTER_GAIN * volume, ctx.currentTime, 0.02)
}

interface ToneOpts {
  type?: OscillatorType
  gain?: number
  when?: number
  glideTo?: number
  attack?: number
}

/** A single oscillator note with a smooth attack/exponential release. */
function tone(freq: number, dur: number, o: ToneOpts = {}): void {
  if (muted) return
  const audio = getCtx()
  if (!audio || !master) return
  const { type = 'sine', gain = 0.18, when = 0, glideTo, attack = 0.006 } = o
  const t = audio.currentTime + when
  const osc = audio.createOscillator()
  const g = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

interface NoiseOpts {
  type?: BiquadFilterType
  freq?: number
  freqEnd?: number
  q?: number
  gain?: number
  when?: number
}

/** A filtered white-noise burst — the basis for card/chip/whoosh/boom sounds. */
function noise(dur: number, o: NoiseOpts = {}): void {
  if (muted) return
  const audio = getCtx()
  if (!audio || !master || !noiseBuffer) return
  const { type = 'bandpass', freq = 2000, freqEnd, q = 1, gain = 0.15, when = 0 } = o
  const t = audio.currentTime + when
  const src = audio.createBufferSource()
  src.buffer = noiseBuffer
  const filter = audio.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, t)
  if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur)
  filter.Q.value = q
  const g = audio.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(master)
  src.start(t)
  src.stop(t + dur + 0.03)
}

export const sfx = {
  // — UI —
  click: () => tone(300, 0.045, { type: 'triangle', gain: 0.07 }),
  tick: () => tone(1400, 0.018, { type: 'sine', gain: 0.035 }),

  // — chips / cards —
  bet: () => {
    // chip clink: bright transient + two soft metallic partials
    noise(0.05, { type: 'highpass', freq: 4200, q: 1, gain: 0.06 })
    tone(1080, 0.06, { type: 'triangle', gain: 0.1 })
    tone(1520, 0.07, { type: 'triangle', gain: 0.07, when: 0.04 })
  },
  card: () => {
    // quick paper "fwip": bandpass noise sweeping down + a little body
    noise(0.085, { type: 'bandpass', freq: 3800, freqEnd: 1400, q: 0.7, gain: 0.16 })
    tone(180, 0.05, { type: 'triangle', gain: 0.05 })
  },
  reveal: () => tone(740, 0.13, { type: 'triangle', gain: 0.12, glideTo: 1180 }),

  // — outcomes —
  win: () => {
    tone(523.25, 0.18, { type: 'triangle', gain: 0.12 })
    tone(659.25, 0.18, { type: 'triangle', gain: 0.12, when: 0.085 })
    tone(783.99, 0.26, { type: 'triangle', gain: 0.13, when: 0.17 })
  },
  bigWin: () => {
    tone(523.25, 0.16, { type: 'triangle', gain: 0.12 })
    tone(659.25, 0.16, { type: 'triangle', gain: 0.12, when: 0.1 })
    tone(783.99, 0.16, { type: 'triangle', gain: 0.13, when: 0.2 })
    tone(1046.5, 0.36, { type: 'triangle', gain: 0.14, when: 0.3 })
    noise(0.3, { type: 'highpass', freq: 6500, q: 0.8, gain: 0.04, when: 0.28 })
  },
  lose: () => {
    tone(392, 0.16, { type: 'sine', gain: 0.1, glideTo: 233 })
    tone(196, 0.22, { type: 'sine', gain: 0.07, when: 0.1 })
  },
  explode: () => {
    // muffled boom: lowpass noise collapsing + a sub thump
    noise(0.45, { type: 'lowpass', freq: 900, freqEnd: 90, q: 1, gain: 0.28 })
    tone(70, 0.32, { type: 'sine', gain: 0.2, glideTo: 40 })
  },
  cashout: () => {
    tone(659.25, 0.09, { type: 'triangle', gain: 0.12 })
    tone(987.77, 0.14, { type: 'triangle', gain: 0.12, when: 0.06 })
    noise(0.12, { type: 'highpass', freq: 6000, q: 0.8, gain: 0.05, when: 0.05 })
  },

  // — motion / money —
  spin: () => noise(0.5, { type: 'bandpass', freq: 320, freqEnd: 2200, q: 1.2, gain: 0.12 }),
  coin: () => {
    tone(1318.5, 0.07, { type: 'triangle', gain: 0.12 })
    tone(1975.5, 0.16, { type: 'triangle', gain: 0.11, when: 0.05 })
  },
}
