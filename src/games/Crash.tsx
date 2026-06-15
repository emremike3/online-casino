import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Rocket, Zap } from 'lucide-react'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const HOUSE_EDGE = 0.99
const GROWTH_BASE = 1.0007 // multiplier = GROWTH_BASE^elapsedMs (~2× in ~1s, ~10× in ~3.3s)
const MIN_AUTO = 1.01
const RESET_MS = 1200
const meta = GAMES_BY_ID['crash']

type Phase = 'idle' | 'flying' | 'crashed'

interface Result {
  crashPoint: number
  cashedAt: number | null // multiplier the player cashed out at, null if crashed first
}

/** Classic 1%-edge crash distribution: P(crash >= x) = 0.99 / x. */
function crashFromFloat(f: number): number {
  return Math.max(1, Math.floor((HOUSE_EDGE / (1 - f)) * 100) / 100)
}

/** Time (ms) at which the curve reaches a given multiplier. */
function timeForMultiplier(m: number): number {
  return Math.log(m) / Math.log(GROWTH_BASE)
}

/** A pill colour bucket for a finished crash point. */
function pillClass(m: number): string {
  if (m < 2) return 'bg-loss/15 text-loss'
  if (m > 10) return 'bg-gold/15 text-gold'
  return 'bg-elevated text-muted'
}

export function Crash() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [autoOn, setAutoOn] = useState(false)
  const [autoTarget, setAutoTarget] = useState(2)
  const [phase, setPhase] = useState<Phase>('idle')
  const [multiplier, setMultiplier] = useState(1)
  const [result, setResult] = useState<Result | null>(null)
  const [history, setHistory] = useState<number[]>([])

  // refs that drive the RAF loop without re-subscribing each frame
  const rafRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const stakeRef = useRef(0)
  const crashRef = useRef(0)
  const cashedRef = useRef(false)
  const lastTickRef = useRef(0)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // cancel any in-flight frame / timer on unmount (avoid setState-after-unmount)
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const flying = phase === 'flying'
  const crashed = phase === 'crashed'

  const autoTargetValid = !autoOn || (Number.isFinite(autoTarget) && autoTarget >= MIN_AUTO)
  const livePayout = round2(stakeRef.current * multiplier)

  /** Settle the round as a player win at multiplier `m`. */
  const settleWin = (m: number) => {
    cashedRef.current = true
    const payout = round2(stakeRef.current * m)
    credit(payout)
    ;(payout >= stakeRef.current * 10 ? sfx.bigWin : sfx.cashout)()
    recordBet({
      game: 'crash',
      gameLabel: 'Crash',
      betAmount: stakeRef.current,
      multiplier: m,
      payout,
    })
  }

  /** Settle the round as a crash (loss) — only if not already cashed. */
  const settleLoss = () => {
    if (cashedRef.current) return
    recordBet({
      game: 'crash',
      gameLabel: 'Crash',
      betAmount: stakeRef.current,
      multiplier: 0,
      payout: 0,
    })
  }

  const stopLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const endRound = (cashedAt: number | null) => {
    stopLoop()
    const crashPoint = crashRef.current
    setMultiplier(crashPoint)
    setResult({ crashPoint, cashedAt })
    setHistory((h) => [crashPoint, ...h].slice(0, 14))
    setPhase('crashed')
    // Only the rocket actually exploding is a crash; a successful cashout
    // already played its own sound in settleWin().
    if (cashedAt === null) sfx.explode()
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      setPhase('idle')
      setMultiplier(1)
      setResult(null)
    }, RESET_MS)
  }

  const frame = (now: number) => {
    const elapsed = now - startRef.current
    const raw = Math.pow(GROWTH_BASE, elapsed)
    const crashPoint = crashRef.current
    const target = autoOn ? Math.max(MIN_AUTO, autoTarget) : Infinity

    // Auto cash out: player wins at the target only if it's below the crash point.
    if (!cashedRef.current && target <= crashPoint && raw >= target) {
      setMultiplier(target)
      settleWin(target)
      endRound(target)
      return
    }

    // Reached the crash point before any cashout → bust.
    if (raw >= crashPoint) {
      settleLoss()
      endRound(null)
      return
    }

    // Still flying.
    const shown = Math.floor(raw * 100) / 100
    setMultiplier(shown)
    if (now - lastTickRef.current > 220) {
      lastTickRef.current = now
      sfx.tick()
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  const launch = () => {
    if (flying) return
    if (!autoTargetValid) return
    if (!bet(amount)) return

    const { floats } = drawFloats(1)
    crashRef.current = crashFromFloat(floats[0])
    stakeRef.current = amount
    cashedRef.current = false
    startRef.current = performance.now()
    lastTickRef.current = startRef.current

    setResult(null)
    setMultiplier(1)
    setPhase('flying')
    sfx.bet()
    rafRef.current = requestAnimationFrame(frame)
  }

  const cashOut = () => {
    if (!flying || cashedRef.current) return
    const m = Math.floor(Math.pow(GROWTH_BASE, performance.now() - startRef.current) * 100) / 100
    // Safety: never let a manual cashout exceed the crash point.
    if (m >= crashRef.current) {
      settleLoss()
      endRound(null)
      return
    }
    settleWin(m)
    endRound(m)
  }

  const primaryAction = flying ? cashOut : launch

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={flying} />

      {/* Auto cash out */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="stat-label">Auto Cash Out</span>
          <button
            disabled={flying}
            onClick={() => {
              sfx.tick()
              setAutoOn((v) => !v)
            }}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-50',
              autoOn ? 'bg-brand-gradient text-white' : 'bg-elevated text-subtle',
            )}
          >
            {autoOn ? 'On' : 'Off'}
          </button>
        </div>
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-base px-3 transition-colors',
            autoOn ? 'border-border focus-within:border-brand/60' : 'border-border opacity-50',
            autoOn && !autoTargetValid && 'border-loss/60',
          )}
        >
          <Zap size={15} className="shrink-0 text-gold" />
          <input
            type="number"
            inputMode="decimal"
            min={MIN_AUTO}
            step="any"
            value={Number.isFinite(autoTarget) ? autoTarget : ''}
            disabled={flying || !autoOn}
            onChange={(e) => setAutoTarget(parseFloat(e.target.value))}
            onBlur={(e) => {
              const v = parseFloat(e.target.value)
              setAutoTarget(Number.isFinite(v) ? round2(Math.max(MIN_AUTO, v)) : 2)
            }}
            className="w-full bg-transparent py-2.5 text-sm font-semibold text-white outline-none placeholder:text-subtle disabled:opacity-60"
            placeholder="2.00"
          />
          <span className="shrink-0 text-sm font-semibold text-subtle">×</span>
        </div>
        {autoOn && !autoTargetValid && (
          <p className="text-xs text-loss">Target must be at least {MIN_AUTO.toFixed(2)}×.</p>
        )}
      </div>

      {/* Live cash-out potential */}
      <div className="space-y-1">
        <span className="stat-label">{flying ? 'Cash Out at' : 'Cash Out Value'}</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span className="tabular-nums">{(flying ? livePayout : amount).toFixed(2)}</span>
          <span className="text-xs font-normal text-subtle tabular-nums">
            {flying ? `${multiplier.toFixed(2)}×` : autoOn ? `auto ${Math.max(MIN_AUTO, autoTarget || 0).toFixed(2)}×` : 'manual'}
          </span>
        </div>
      </div>

      {flying ? (
        <Button variant="win" className="w-full py-4 text-base" onClick={primaryAction}>
          Cash Out {livePayout.toFixed(2)}
        </Button>
      ) : (
        <Button
          variant="primary"
          className="w-full py-4 text-base"
          disabled={!autoTargetValid}
          onClick={primaryAction}
        >
          {crashed ? 'Place Bet' : 'Bet'}
        </Button>
      )}

      <p className="text-center text-xs text-subtle">
        {flying
          ? 'Cash out before the rocket explodes.'
          : crashed
            ? result?.cashedAt
              ? `Cashed out @ ${result.cashedAt.toFixed(2)}×`
              : `Crashed @ ${result?.crashPoint.toFixed(2)}×`
            : 'Set your bet and an optional auto cash out.'}
      </p>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-2xl flex-col items-center gap-5">
        {/* Recent crash points */}
        <div className="flex h-7 min-h-7 flex-wrap items-center justify-center gap-1.5">
          {history.map((m, i) => (
            <span
              key={i}
              className={cn('rounded-md px-2 py-0.5 font-mono text-xs font-semibold', pillClass(m))}
            >
              {m.toFixed(2)}×
            </span>
          ))}
        </div>

        {/* Graph + multiplier */}
        <CrashGraph multiplier={multiplier} phase={phase} crashPoint={crashRef.current} />

        {/* Result line */}
        <div className="h-6 text-center text-sm font-semibold">
          {crashed ? (
            result?.cashedAt ? (
              <span className="text-win">
                Cashed out @ {result.cashedAt.toFixed(2)}× · won{' '}
                {round2(stakeRef.current * result.cashedAt).toFixed(2)}
              </span>
            ) : (
              <span className="text-loss">Crashed @ {result?.crashPoint.toFixed(2)}×</span>
            )
          ) : flying ? (
            <span className="text-win">Flying… {multiplier.toFixed(2)}×</span>
          ) : (
            <span className="text-subtle">Press Bet to launch the rocket</span>
          )}
        </div>
      </div>
    </GameLayout>
  )
}

interface GraphProps {
  multiplier: number
  phase: Phase
  crashPoint: number
}

function CrashGraph({ multiplier, phase, crashPoint }: GraphProps) {
  const flying = phase === 'flying'
  const crashed = phase === 'crashed'

  // Logical SVG viewport.
  const W = 600
  const H = 300
  const padX = 8
  const padY = 8

  // Map elapsed-progress and multiplier to screen coords. We scale the X axis by
  // the time-to-current-multiplier so the head keeps moving, and the Y axis by
  // the multiplier with a rolling ceiling so the curve always fits and steepens.
  const ceiling = Math.max(2, multiplier * 1.25)
  const nowT = timeForMultiplier(Math.max(1, multiplier))
  const spanT = Math.max(timeForMultiplier(2), nowT) // keep at least a 2× window

  const x = (m: number) => {
    const t = timeForMultiplier(Math.max(1, m))
    const frac = spanT === 0 ? 0 : t / spanT
    return padX + frac * (W - padX * 2)
  }
  const y = (m: number) => {
    const frac = (Math.max(1, m) - 1) / (ceiling - 1)
    return H - padY - frac * (H - padY * 2)
  }

  // Build the curve as a polyline sampled across the current multiplier range.
  const steps = 48
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const m = 1 + (Math.max(1, multiplier) - 1) * (i / steps)
    pts.push(`${x(m).toFixed(1)},${y(m).toFixed(1)}`)
  }
  const line = pts.join(' ')
  const headX = x(multiplier)
  const headY = y(multiplier)
  const area = `${padX},${H - padY} ${line} ${headX.toFixed(1)},${(H - padY).toFixed(1)}`

  const stroke = crashed ? '#ff3b59' : '#00e701'

  return (
    <motion.div
      animate={crashed ? { x: [0, -10, 9, -7, 6, 0] } : { x: 0 }}
      transition={crashed ? { duration: 0.45 } : { duration: 0.2 }}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border bg-base',
        crashed ? 'border-loss/50' : 'border-border',
      )}
    >
      {/* animated starfield / glow backdrop */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 transition-colors duration-300',
          crashed
            ? 'bg-[radial-gradient(circle_at_50%_60%,rgba(255,77,106,0.22),transparent_70%)]'
            : 'bg-[radial-gradient(circle_at_30%_80%,rgba(124,92,255,0.18),transparent_70%)]',
        )}
      />
      <Starfield active={flying} />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="relative block h-[260px] w-full sm:h-[300px]"
      >
        <defs>
          <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={W - padX}
            y1={H * f}
            y2={H * f}
            stroke="currentColor"
            strokeWidth={1}
            className="text-border/50"
          />
        ))}

        {/* filled area under the curve */}
        <polygon points={area} fill="url(#crashFill)" />
        {/* the curve itself */}
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* HUGE centered multiplier */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          key={crashed ? 'crash' : 'fly'}
          animate={crashed ? { scale: [1, 1.12, 1] } : { scale: 1 }}
          transition={{ duration: 0.35 }}
          className={cn(
            'select-none font-mono text-6xl font-extrabold tabular-nums drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-7xl',
            crashed ? 'text-loss' : flying ? 'text-win' : 'text-subtle/40',
          )}
        >
          {multiplier.toFixed(2)}×
        </motion.div>
        {crashed && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 text-sm font-bold uppercase tracking-widest text-loss"
          >
            Crashed @ {crashPoint.toFixed(2)}×
          </motion.div>
        )}
      </div>

      {/* leading rocket / dot at the curve tip */}
      <RocketTip xFrac={headX / W} yFrac={headY / H} phase={phase} stroke={stroke} />
    </motion.div>
  )
}

function RocketTip({
  xFrac,
  yFrac,
  phase,
  stroke,
}: {
  xFrac: number
  yFrac: number
  phase: Phase
  stroke: string
}) {
  const flying = phase === 'flying'
  const crashed = phase === 'crashed'
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: `${xFrac * 100}%`, top: `${yFrac * 100}%`, transform: 'translate(-50%, -50%)' }}
    >
      <motion.div
        animate={crashed ? { scale: [1, 1.6, 0], rotate: 30, opacity: [1, 1, 0] } : { scale: 1 }}
        transition={crashed ? { duration: 0.5 } : { type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Rocket
          size={26}
          strokeWidth={2.4}
          className={cn(
            '-rotate-45',
            crashed ? 'text-loss' : flying ? 'text-win' : 'text-subtle/50',
          )}
          style={{ filter: `drop-shadow(0 0 8px ${stroke})` }}
        />
      </motion.div>
    </div>
  )
}

/** Cheap drifting starfield rendered only while the rocket is flying. */
function Starfield({ active }: { active: boolean }) {
  const stars = useRef(
    Array.from({ length: 26 }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: Math.random() * 2 + 1,
      delay: Math.random() * 2,
      dur: Math.random() * 2 + 1.6,
    })),
  ).current

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white/70"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size }}
          animate={active ? { y: [0, 26], opacity: [0, 0.8, 0] } : { opacity: 0.15 }}
          transition={
            active
              ? { duration: s.dur, delay: s.delay, repeat: Infinity, ease: 'linear' }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  )
}
