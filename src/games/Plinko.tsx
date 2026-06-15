import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const meta = GAMES_BY_ID['plinko']

const ROWS = 16
const BUCKETS = ROWS + 1 // 17
const DROP_MS = 1150

type Risk = 'low' | 'medium' | 'high'

const RISKS: Risk[] = ['low', 'medium', 'high']

const MULTIPLIERS: Record<Risk, number[]> = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
}

/**
 * Visual tier of a bucket, derived from how far above 1× the multiplier sits.
 * Drives the colour ramp: hot amber/red at the edges, cool/dim in the middle.
 */
function bucketTier(m: number): 0 | 1 | 2 | 3 | 4 {
  if (m >= 25) return 4
  if (m >= 4) return 3
  if (m >= 1.5) return 2
  if (m >= 1) return 1
  return 0
}

const TIER_STYLE: Record<number, string> = {
  4: 'bg-loss text-white shadow-[0_0_14px_-2px_rgba(255,59,89,0.7)]',
  3: 'bg-[#ff6a2b] text-white',
  2: 'bg-gold text-black',
  1: 'bg-[#3a4d3a] text-win',
  0: 'bg-elevated text-subtle',
}

/** Compact label for a bucket multiplier so big numbers stay one line. */
function bucketLabel(m: number): string {
  if (m >= 100) return `${Math.round(m)}`
  if (Number.isInteger(m)) return `${m}`
  return `${m}`
}

interface Ball {
  id: number
  /** Horizontal centre (% of board width) at the top of each of the 17 levels. */
  xs: number[]
  bucket: number
}

interface Result {
  id: number
  multiplier: number
  win: boolean
}

/** Centre of bucket `b` as a percentage of the board width. */
function bucketCenterPct(b: number): number {
  return ((b + 0.5) / BUCKETS) * 100
}

/**
 * Build the horizontal path (one x% per level, 0..ROWS) for a ball that ends in
 * `bucket`, given the per-row right/left decisions. The path lands exactly on
 * the bucket centre at the final level.
 */
function buildPath(rights: boolean[], bucket: number): number[] {
  const step = 100 / BUCKETS
  const xs: number[] = [50]
  let count = 0
  for (let i = 0; i < ROWS; i++) {
    count += rights[i] ? 1 : 0
    const level = i + 1
    if (level === ROWS) {
      xs.push(bucketCenterPct(bucket))
    } else {
      xs.push(50 + (count - level / 2) * step)
    }
  }
  return xs
}

export function Plinko() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [risk, setRisk] = useState<Risk>('medium')
  const [balls, setBalls] = useState<Ball[]>([])
  const [results, setResults] = useState<Result[]>([])
  /** bucketIndex -> timestamp of last landing, used to retrigger the flash. */
  const [flashes, setFlashes] = useState<Record<number, number>>({})

  const idRef = useRef(0)
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  // Tidy up any pending settle timers when leaving the game.
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((t) => clearTimeout(t))
      pending.clear()
    }
  }, [])

  const table = MULTIPLIERS[risk]

  const drop = () => {
    // Settle (deduct + credit + record) happens here, at launch, so navigating
    // away mid-flight can never lose or duplicate a payout. The animation that
    // follows is purely cosmetic.
    if (!bet(amount)) return
    sfx.bet()

    const { floats } = drawFloats(ROWS)
    const rights = floats.map((f) => f >= 0.5)
    const bucket = rights.reduce((acc, r) => acc + (r ? 1 : 0), 0)
    const multiplier = table[bucket]
    const payout = round2(amount * multiplier)
    const win = payout > amount

    if (payout > 0) credit(payout)
    recordBet({
      game: 'plinko',
      gameLabel: 'Plinko',
      betAmount: amount,
      multiplier: payout > 0 ? multiplier : 0,
      payout,
    })

    const id = idRef.current++
    const xs = buildPath(rights, bucket)
    setBalls((b) => [...b, { id, xs, bucket }])

    // A few crisp peg ticks while it tumbles down.
    for (let i = 1; i <= 4; i++) {
      const t = setTimeout(() => {
        timers.current.delete(t)
        sfx.tick()
      }, (DROP_MS / 5) * i)
      timers.current.add(t)
    }

    // On land: flash the bucket, play the settle sound, log the result, cull.
    const settle = setTimeout(() => {
      timers.current.delete(settle)
      setFlashes((f) => ({ ...f, [bucket]: Date.now() }))
      if (win) (payout >= amount * 10 ? sfx.bigWin : sfx.coin)()
      else sfx.lose()
      setResults((r) => [{ id, multiplier, win }, ...r].slice(0, 14))
      setBalls((b) => b.filter((x) => x.id !== id))
    }, DROP_MS)
    timers.current.add(settle)
  }

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} />

      <div>
        <span className="stat-label">Risk</span>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {RISKS.map((r) => (
            <button
              key={r}
              onClick={() => {
                sfx.tick()
                setRisk(r)
              }}
              className={cn(
                'btn rounded-lg py-2.5 text-sm capitalize',
                risk === r ? 'bg-brand-gradient text-white' : 'btn-ghost',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="stat-label">Rows</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold">
            {ROWS}
          </div>
        </div>
        <div className="space-y-1">
          <span className="stat-label">Balls in play</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold tabular-nums">
            {balls.length}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <span className="stat-label">Multiplier Range</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span>{table[Math.floor(BUCKETS / 2)]}×</span>
          <span>{Math.max(...table)}×</span>
        </div>
      </div>

      <Button variant="primary" className="w-full py-4 text-base" onClick={drop}>
        Drop Ball
      </Button>

      <p className="text-center text-xs text-subtle">
        Rapid-fire allowed — drop as many balls as you like.
      </p>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-2xl flex-col items-center gap-4">
        {/* Recent results */}
        <div className="flex h-7 min-h-7 flex-wrap items-center justify-center gap-1.5">
          {results.map((r) => (
            <span
              key={r.id}
              className={cn(
                'rounded-md px-2 py-1 font-mono text-xs font-semibold',
                r.win ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss',
              )}
            >
              {r.multiplier}×
            </span>
          ))}
        </div>

        <Board risk={risk} table={table} balls={balls} flashes={flashes} />
      </div>
    </GameLayout>
  )
}

interface BoardProps {
  risk: Risk
  table: number[]
  balls: Ball[]
  flashes: Record<number, number>
}

function Board({ risk, table, balls, flashes }: BoardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // Track the board's pixel width so peg/ball sizing scales responsively.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Vertical band reserved for the peg field (top), buckets sit below it.
  const pegBandPct = 86
  const colW = width / BUCKETS
  const pegSize = Math.max(3, Math.min(8, colW * 0.18))
  const ballSize = Math.max(8, Math.min(16, colW * 0.55))

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-2xl border border-border bg-base/60 p-2 sm:p-3"
      style={{ aspectRatio: '4 / 3' }}
    >
      {/* Peg field */}
      <div className="absolute inset-x-2 top-2 sm:inset-x-3 sm:top-3" style={{ height: `${pegBandPct}%` }}>
        <div className="relative h-full w-full">
          {Array.from({ length: ROWS }).map((_, row) => {
            const pegsInRow = row + 3
            const yPct = ((row + 1) / (ROWS + 1)) * 100
            // Pegs are centred and spaced one bucket-column apart per row.
            const spacing = 100 / BUCKETS
            const rowWidthPct = (pegsInRow - 1) * spacing
            const startPct = 50 - rowWidthPct / 2
            return Array.from({ length: pegsInRow }).map((__, peg) => (
              <div
                key={`${row}-${peg}`}
                className="absolute rounded-full bg-subtle/70"
                style={{
                  left: `${startPct + peg * spacing}%`,
                  top: `${yPct}%`,
                  width: pegSize,
                  height: pegSize,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))
          })}

          {/* Balls in flight */}
          <AnimatePresence>
            {balls.map((ball) => (
              <FallingBall key={ball.id} ball={ball} size={ballSize} pegBandPct={pegBandPct} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Bucket row */}
      <div className="absolute inset-x-2 bottom-2 sm:inset-x-3 sm:bottom-3 flex gap-[2px]">
        {table.map((m, i) => (
          <Bucket key={i} multiplier={m} flash={flashes[i]} risk={risk} />
        ))}
      </div>
    </div>
  )
}

interface FallingBallProps {
  ball: Ball
  size: number
  pegBandPct: number
}

function FallingBall({ ball, size, pegBandPct }: FallingBallProps) {
  // y keyframes: one per level, descending row by row to the bucket lip.
  const ys = ball.xs.map((_, i) => ((i + 1) / (ROWS + 1)) * pegBandPct)
  return (
    <motion.div
      className="absolute z-10 rounded-full bg-gradient-to-b from-white to-gold shadow-[0_0_12px_2px_rgba(255,201,60,0.65)]"
      style={{ width: size, height: size, translateX: '-50%', translateY: '-50%' }}
      initial={{ left: '50%', top: '0%', opacity: 0, scale: 0.6 }}
      animate={{
        left: ball.xs.map((x) => `${x}%`),
        top: ys.map((y) => `${y}%`),
        opacity: 1,
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{
        duration: DROP_MS / 1000,
        ease: 'easeIn',
        opacity: { duration: 0.1 },
        scale: { duration: 0.1 },
      }}
    />
  )
}

interface BucketProps {
  multiplier: number
  flash: number | undefined
  risk: Risk
}

function Bucket({ multiplier, flash, risk }: BucketProps) {
  const tier = bucketTier(multiplier)
  return (
    <motion.div
      // `flash` is the landing timestamp; changing it retriggers the pulse.
      key={flash ?? 'idle'}
      animate={
        flash
          ? { y: [0, 5, 0], scale: [1, 1.12, 1] }
          : { y: 0, scale: 1 }
      }
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={cn(
        'flex min-w-0 flex-1 items-center justify-center rounded-md py-1 text-center font-bold tabular-nums leading-none',
        'text-[9px] sm:text-xs',
        TIER_STYLE[tier],
        flash && 'ring-2 ring-white',
      )}
      title={`${multiplier}× · ${risk} risk`}
    >
      {bucketLabel(multiplier)}
    </motion.div>
  )
}
