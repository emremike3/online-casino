import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2, clamp } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const HOUSE_EDGE = 0.99
const MIN_TARGET = 1.01
const ROLL_MS = 600
const QUICK_TARGETS = [1.5, 2, 5, 10]
const meta = GAMES_BY_ID['limbo']

interface Round {
  result: number
  target: number
  win: boolean
}

export function Limbo() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [target, setTarget] = useState(2)
  const [last, setLast] = useState<Round | null>(null)
  const [rolling, setRolling] = useState(false)
  const [display, setDisplay] = useState(1) // the rolling-up number on screen
  const [history, setHistory] = useState<Round[]>([])

  const rafRef = useRef<number | null>(null)

  // clean up any in-flight animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const winChance = round2((HOUSE_EDGE / target) * 100)
  const payout = round2(amount * target)
  const profit = round2(payout - amount)

  const setTargetClamped = (v: number) => {
    setTarget(round2(clamp(Number.isFinite(v) ? v : MIN_TARGET, MIN_TARGET, 1_000_000)))
  }

  const animateTo = (result: number, win: boolean) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const start = performance.now()
    const from = 1
    const span = result - from

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ROLL_MS)
      // ease-out so it decelerates into the final value
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + span * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        rafRef.current = null
        setDisplay(result)
        setLast({ result, target, win })
        setHistory((h) => [{ result, target, win }, ...h].slice(0, 12))
        if (win) (payout >= amount * 10 ? sfx.bigWin : sfx.win)()
        else sfx.lose()
        setRolling(false)
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  const play = () => {
    if (rolling) return
    if (!bet(amount)) return
    setRolling(true)
    setLast(null)
    sfx.bet()

    const { floats } = drawFloats(1)
    const f = floats[0]
    const result = Math.max(1, Math.floor((HOUSE_EDGE / (1 - f)) * 100) / 100)
    const win = result >= target

    const won = win ? payout : 0
    if (won > 0) credit(won)
    recordBet({
      game: 'limbo',
      gameLabel: 'Limbo',
      betAmount: amount,
      multiplier: win ? target : 0,
      payout: won,
    })

    animateTo(result, win)
  }

  // idle = nothing has resolved yet and we're not mid-roll
  const idle = last === null && !rolling
  const showWin = last?.win ?? false

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={rolling} />

      <div className="space-y-1.5">
        <span className="stat-label">Target Multiplier</span>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-base px-3 focus-within:border-brand/60">
          <input
            type="number"
            inputMode="decimal"
            min={MIN_TARGET}
            step="any"
            value={Number.isFinite(target) ? target : ''}
            disabled={rolling}
            onChange={(e) => setTargetClamped(parseFloat(e.target.value))}
            onBlur={(e) => setTargetClamped(parseFloat(e.target.value))}
            className="w-full bg-transparent py-2.5 text-sm font-semibold text-white outline-none placeholder:text-subtle disabled:opacity-60"
            placeholder="2.00"
          />
          <span className="shrink-0 text-sm font-semibold text-subtle">×</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_TARGETS.map((q) => (
            <button
              key={q}
              disabled={rolling}
              onClick={() => {
                sfx.tick()
                setTargetClamped(q)
              }}
              className={cn(
                'btn rounded-lg py-2 text-xs font-semibold',
                target === q ? 'bg-brand-gradient text-white' : 'btn-ghost',
              )}
            >
              {q}×
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="stat-label">Multiplier</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold">
            {target.toFixed(2)}×
          </div>
        </div>
        <div className="space-y-1">
          <span className="stat-label">Win Chance</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold">
            {winChance.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <span className="stat-label">Payout on Win</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span>{payout.toFixed(2)}</span>
          <span className="text-xs font-normal text-subtle">profit +{profit.toFixed(2)}</span>
        </div>
      </div>

      <Button variant="primary" className="w-full py-4 text-base" disabled={rolling} onClick={play}>
        {rolling ? 'Rolling…' : 'Bet'}
      </Button>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-xl flex-col items-center gap-8">
        {/* History pills */}
        <div className="flex h-8 min-h-8 flex-wrap items-center justify-center gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className={cn(
                'rounded-md px-2 py-1 font-mono text-xs font-semibold',
                h.win ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss',
              )}
            >
              {h.result.toFixed(2)}×
            </span>
          ))}
        </div>

        {/* Huge multiplier readout */}
        <div className="flex flex-col items-center justify-center">
          <motion.div
            key={last ? `${last.result}-${last.win}` : rolling ? 'rolling' : 'idle'}
            initial={{ scale: last ? 0.85 : 1, opacity: last ? 0.6 : 1 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            className={cn(
              'select-none font-mono text-6xl font-extrabold tabular-nums sm:text-7xl',
              idle && 'text-subtle/40',
              !idle && (showWin ? 'text-win' : 'text-loss'),
            )}
          >
            {(idle ? 1 : display).toFixed(2)}×
          </motion.div>

          <div className="mt-4 text-center text-sm font-semibold text-muted">
            Target <span className="text-white">{target.toFixed(2)}×</span>
            <span className="mx-2 text-subtle">·</span>
            Win chance <span className="text-white">{winChance.toFixed(2)}%</span>
          </div>
        </div>

        {/* Result line */}
        <div className="h-6 text-center text-sm font-semibold">
          {last ? (
            showWin ? (
              <span className="text-win">Win! Paid {payout.toFixed(2)} ({last.result.toFixed(2)}× ≥ {last.target.toFixed(2)}×)</span>
            ) : (
              <span className="text-loss">Crashed at {last.result.toFixed(2)}× · needed {last.target.toFixed(2)}×</span>
            )
          ) : (
            <span className="text-subtle">Set a target and place your bet</span>
          )}
        </div>
      </div>
    </GameLayout>
  )
}
