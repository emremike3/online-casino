import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { floatToInt } from '@/lib/rng'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const meta = GAMES_BY_ID['wheel']

const N = 40
const SEG_ANGLE = 360 / N

type Risk = 'Low' | 'Medium' | 'High'

/** Small base patterns repeated around the wheel to length N (40). */
const BASE: Record<Risk, number[]> = {
  Low: [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.5, 0],
  Medium: [0, 1.5, 0, 1.9, 0, 2, 0, 1.5, 0, 3],
  High: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9.9],
}

const RISKS: Risk[] = ['Low', 'Medium', 'High']

/** Repeat a base pattern out to exactly N segments. */
function buildSegments(risk: Risk): number[] {
  const base = BASE[risk]
  return Array.from({ length: N }, (_, i) => base[i % base.length])
}

/** Distinct multipliers (sorted) used for the legend, excluding the lose tier. */
function tiers(segments: number[]): number[] {
  return Array.from(new Set(segments.filter((m) => m > 0))).sort((a, b) => a - b)
}

/** Map a multiplier to a color along a red → gold → green ramp. */
function colorFor(mult: number, max: number): string {
  if (mult <= 0) return '#2a1620' // dark red-tinted "lose" wedge
  const t = max <= 1 ? 1 : (mult - 1) / (max - 1) // 0 at low wins, 1 at the top tier
  if (t < 0.5) {
    // amber → gold
    const k = t / 0.5
    return mix([255, 122, 57], [255, 201, 60], k)
  }
  // gold → win green
  const k = (t - 0.5) / 0.5
  return mix([255, 201, 60], [0, 231, 1], k)
}

function mix(a: number[], b: number[], k: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

interface Spin {
  idx: number
  multiplier: number
  win: boolean
}

export function Wheel() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [risk, setRisk] = useState<Risk>('Medium')
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [last, setLast] = useState<Spin | null>(null)
  const [history, setHistory] = useState<Spin[]>([])
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const segments = useMemo(() => buildSegments(risk), [risk])
  const maxMult = useMemo(() => Math.max(...segments), [segments])
  const legend = useMemo(() => tiers(segments), [segments])

  // Pre-rendered conic gradient: one hard-edged stop per segment.
  const conic = useMemo(() => {
    const stops = segments
      .map((m, i) => {
        const from = (i * SEG_ANGLE).toFixed(4)
        const to = ((i + 1) * SEG_ANGLE).toFixed(4)
        const c = colorFor(m, maxMult)
        return `${c} ${from}deg ${to}deg`
      })
      .join(', ')
    // Offset so segment 0 is centered under the top pointer at rotation 0.
    return `conic-gradient(from ${-SEG_ANGLE / 2}deg, ${stops})`
  }, [segments, maxMult])

  const play = () => {
    if (spinning) return
    if (!bet(amount)) return

    const { floats } = drawFloats(1)
    const idx = floatToInt(floats[0], 0, N - 1)
    const multiplier = segments[idx]
    const win = multiplier > 0
    const payout = win ? round2(amount * multiplier) : 0

    setSpinning(true)
    setLast(null)
    sfx.spin()

    // Land segment `idx` centered under the fixed top (12 o'clock) pointer.
    // The conic gradient already centers segment 0 at the top, so we only
    // need to rotate by the segment's index offset (counter-clockwise) plus
    // a handful of full turns for flair.
    const spins = 6
    const base = rotation - (rotation % 360) // normalize away prior full turns
    const target = base + 360 * spins + (360 - idx * SEG_ANGLE)
    setRotation(target)

    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const result: Spin = { idx, multiplier, win }
      if (payout > 0) credit(payout)
      recordBet({
        game: 'wheel',
        gameLabel: 'Wheel',
        betAmount: amount,
        multiplier: win ? multiplier : 0,
        payout,
      })
      setLast(result)
      setHistory((h) => [result, ...h].slice(0, 14))
      if (win) (payout >= amount * 10 ? sfx.bigWin : sfx.win)()
      else sfx.lose()
      setSpinning(false)
    }, 3600)
  }

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={spinning} />

      <div>
        <span className="stat-label">Risk</span>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {RISKS.map((r) => (
            <button
              key={r}
              disabled={spinning}
              onClick={() => {
                sfx.tick()
                setRisk(r)
              }}
              className={cn(
                'btn rounded-lg py-2.5 text-sm',
                risk === r ? 'bg-brand-gradient text-white' : 'btn-ghost',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <span className="stat-label">Segments</span>
        <div className="rounded-lg border border-border bg-base p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {legend.map((m) => (
              <span
                key={m}
                className="rounded-md px-2 py-1 font-mono text-xs font-bold text-black/90"
                style={{ background: colorFor(m, maxMult) }}
              >
                {m}×
              </span>
            ))}
            <span className="rounded-md bg-[#2a1620] px-2 py-1 font-mono text-xs font-bold text-loss">
              0×
            </span>
          </div>
          <p className="mt-2 text-xs text-subtle">
            {N} segments · top multiplier{' '}
            <span className="font-semibold text-gold">{maxMult}×</span>
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <span className="stat-label">Potential Win</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span>{round2(amount * maxMult).toFixed(2)}</span>
          <span className="text-xs font-normal text-subtle">at {maxMult}×</span>
        </div>
      </div>

      <Button
        variant="primary"
        className="w-full py-4 text-base"
        disabled={spinning}
        onClick={play}
      >
        {spinning ? 'Spinning…' : 'Spin'}
      </Button>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-xl flex-col items-center gap-6">
        {/* Result readout */}
        <div className="flex h-16 items-center justify-center">
          {last ? (
            <motion.div
              key={`${last.idx}-${last.multiplier}`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              className={cn(
                'text-5xl font-extrabold tabular-nums sm:text-6xl',
                last.win ? 'text-win' : 'text-loss',
              )}
            >
              {last.win ? `${last.multiplier}×` : 'Bust'}
            </motion.div>
          ) : (
            <div className="text-5xl font-extrabold tabular-nums text-subtle/30 sm:text-6xl">
              {spinning ? '…' : '0.00×'}
            </div>
          )}
        </div>

        {/* Wheel */}
        <div className="relative aspect-square w-full max-w-[340px] select-none sm:max-w-[400px]">
          {/* Fixed pointer at 12 o'clock */}
          <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2">
            <div
              className="h-0 w-0 border-x-[12px] border-t-[20px] border-x-transparent border-t-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
              aria-hidden
            />
          </div>

          {/* Outer ring glow */}
          <div className="absolute inset-0 rounded-full bg-[#0c0e15] p-[3%] shadow-glow">
            {/* Spinning disc */}
            <motion.div
              className="relative h-full w-full rounded-full border-[6px] border-[#1a1d29]"
              style={{ background: conic }}
              animate={{ rotate: rotation }}
              transition={{ duration: 3.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Subtle tick marks between segments */}
              <div className="pointer-events-none absolute inset-0 rounded-full">
                {segments.map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-1/2 top-1/2 h-1/2 w-px origin-bottom bg-black/25"
                    style={{
                      transform: `translate(-50%, -100%) rotate(${i * SEG_ANGLE + SEG_ANGLE / 2}deg)`,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </div>

          {/* Hub */}
          <div className="absolute left-1/2 top-1/2 z-10 flex aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#1a1d29] bg-elevated shadow-card">
            <span
              className={cn(
                'text-lg font-extrabold tabular-nums sm:text-xl',
                last ? (last.win ? 'text-win' : 'text-loss') : 'text-muted',
              )}
            >
              {last ? `${last.multiplier}×` : `${maxMult}×`}
            </span>
          </div>
        </div>

        {/* Recent results */}
        <div className="flex h-8 min-h-8 flex-wrap items-center justify-center gap-1.5">
          {history.length === 0 ? (
            <span className="text-xs text-subtle">No spins yet — give it a whirl.</span>
          ) : (
            history.map((h, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-md px-2 py-1 font-mono text-xs font-bold',
                  h.win ? 'text-black/90' : 'bg-loss/15 text-loss',
                )}
                style={h.win ? { background: colorFor(h.multiplier, maxMult) } : undefined}
              >
                {h.win ? `${h.multiplier}×` : '0×'}
              </span>
            ))
          )}
        </div>
      </div>
    </GameLayout>
  )
}
