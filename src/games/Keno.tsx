import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Eraser } from 'lucide-react'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { WinBadge } from '@/components/game/WinBadge'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { shuffledIndices } from '@/lib/rng'
import { cn } from '@/lib/cn'

const meta = GAMES_BY_ID['keno']

const TOTAL = 40
const DRAW_COUNT = 10
const MAX_SPOTS = 10
const REVEAL_STAGGER = 130 // ms between each drawn number

/** Payout multiplier table keyed by [spots picked][hits]. 0 = no win. */
const PAYOUTS: Record<number, Record<number, number>> = {
  1: { 0: 0, 1: 3.8 },
  2: { 0: 0, 1: 1.7, 2: 5.2 },
  3: { 0: 0, 1: 0, 2: 2.8, 3: 50 },
  4: { 0: 0, 1: 0, 2: 1.7, 3: 10, 4: 100 },
  5: { 0: 0, 1: 0, 2: 1.4, 3: 4, 4: 14, 5: 390 },
  6: { 0: 0, 1: 0, 2: 0, 3: 3, 4: 9, 5: 180, 6: 710 },
  7: { 0: 0, 1: 0, 2: 0, 3: 2, 4: 7, 5: 30, 6: 400, 7: 800 },
  8: { 0: 0, 1: 0, 2: 0, 3: 2, 4: 4, 5: 11, 6: 67, 7: 400, 8: 900 },
  9: { 0: 0, 1: 0, 2: 0, 3: 2, 4: 2.5, 5: 5, 6: 44, 7: 300, 8: 600, 9: 1000 },
  10: { 0: 0, 1: 0, 2: 0, 3: 1.6, 4: 2, 5: 4, 6: 7, 7: 26, 8: 100, 9: 500, 10: 1000 },
}

function payoutMultiplier(spots: number, hits: number): number {
  return PAYOUTS[spots]?.[hits] ?? 0
}

type Phase = 'idle' | 'revealing' | 'done'

export function Keno() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [picks, setPicks] = useState<Set<number>>(new Set())
  const [revealed, setRevealed] = useState<Set<number>>(new Set()) // progressively revealed (also the full draw once done)
  const [phase, setPhase] = useState<Phase>('idle')
  const [hits, setHits] = useState(0)
  const [lastMultiplier, setLastMultiplier] = useState(0)
  const [lastPayout, setLastPayout] = useState(0)
  const [history, setHistory] = useState<{ hits: number; spots: number; win: boolean }[]>([])

  const timers = useRef<number[]>([])
  // Clear any pending reveal timers on unmount.
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const spots = picks.size
  const revealing = phase === 'revealing'
  const previewMultiplier = spots > 0 ? payoutMultiplier(spots, spots) : 0 // best-case (all hit)
  const potential = round2(amount * previewMultiplier)

  const toggle = (n: number) => {
    if (revealing) return
    setPicks((prev) => {
      const next = new Set(prev)
      if (next.has(n)) {
        next.delete(n)
        sfx.tick()
      } else {
        if (next.size >= MAX_SPOTS) return prev
        next.add(n)
        sfx.click()
      }
      return next
    })
    // Picking again clears the previous round's result so the board is "live".
    if (phase === 'done') resetRound()
  }

  const resetRound = () => {
    setRevealed(new Set())
    setHits(0)
    setLastMultiplier(0)
    setLastPayout(0)
    setPhase('idle')
  }

  const autoPick = () => {
    if (revealing) return
    if (phase === 'done') resetRound()
    setPicks((prev) => {
      const target = prev.size >= MAX_SPOTS ? MAX_SPOTS : prev.size === 0 ? MAX_SPOTS : prev.size
      // Already full → nothing to do.
      if (prev.size >= target) return prev
      const next = new Set(prev)
      const pool: number[] = []
      for (let n = 1; n <= TOTAL; n++) if (!next.has(n)) pool.push(n)
      // Fisher–Yates on the available pool (cosmetic randomness only).
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      let k = 0
      while (next.size < target && k < pool.length) next.add(pool[k++])
      return next
    })
    sfx.click()
  }

  const clearPicks = () => {
    if (revealing) return
    setPicks(new Set())
    resetRound()
    sfx.tick()
  }

  const play = () => {
    if (revealing) return
    if (spots < 1) return
    if (!bet(amount)) return

    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []

    sfx.bet()
    setRevealed(new Set())
    setHits(0)
    setLastMultiplier(0)
    setLastPayout(0)
    setPhase('revealing')

    // One nonce per bet → verifiable shuffle of [0..39], first 10 are the draw.
    const { serverSeed, clientSeed, nonce } = drawFloats(1)
    const result = shuffledIndices(serverSeed, clientSeed, nonce, TOTAL)
      .slice(0, DRAW_COUNT)
      .map((i) => i + 1)

    const finalHits = result.filter((n) => picks.has(n)).length
    const multiplier = payoutMultiplier(spots, finalHits)
    const payout = round2(amount * multiplier)

    // Reveal numbers one at a time.
    result.forEach((n, idx) => {
      const t = window.setTimeout(() => {
        setRevealed((prev) => {
          const next = new Set(prev)
          next.add(n)
          return next
        })
        if (picks.has(n)) sfx.reveal()
        else sfx.tick()
      }, idx * REVEAL_STAGGER)
      timers.current.push(t)
    })

    // Settle once every number is shown.
    const settle = window.setTimeout(
      () => {
        setHits(finalHits)
        setLastMultiplier(multiplier)
        setLastPayout(payout)
        setPhase('done')
        setHistory((h) => [{ hits: finalHits, spots, win: payout > 0 }, ...h].slice(0, 10))
        if (payout > 0) {
          credit(payout)
          ;(payout >= amount * 10 ? sfx.bigWin : sfx.win)()
        } else {
          sfx.lose()
        }
        recordBet({
          game: 'keno',
          gameLabel: 'Keno',
          betAmount: amount,
          multiplier: payout > 0 ? multiplier : 0,
          payout,
        })
      },
      DRAW_COUNT * REVEAL_STAGGER + 220,
    )
    timers.current.push(settle)
  }

  // Possible hit→multiplier outcomes for the current spot count.
  const previewRow =
    spots > 0
      ? Array.from({ length: spots + 1 }, (_, h) => ({ hits: h, mult: payoutMultiplier(spots, h) }))
      : []

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={revealing} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="stat-label">Picks</span>
          <span className="text-xs font-semibold text-muted">
            <span className={spots > 0 ? 'text-white' : 'text-subtle'}>{spots}</span>/{MAX_SPOTS}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            disabled={revealing}
            onClick={autoPick}
            className="btn-ghost flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm"
          >
            <Sparkles size={15} className="text-gold" />
            Auto-Pick
          </button>
          <button
            disabled={revealing || spots === 0}
            onClick={clearPicks}
            className="btn-ghost flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm"
          >
            <Eraser size={15} />
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="stat-label">Hits</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold tabular-nums">
            {phase === 'done' ? (
              <span className={lastPayout > 0 ? 'text-win' : 'text-loss'}>
                {hits}/{spots}
              </span>
            ) : (
              <span className="text-subtle">—</span>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <span className="stat-label">Multiplier</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold tabular-nums">
            {phase === 'done' ? (
              <span className={lastPayout > 0 ? 'text-gold' : 'text-subtle'}>
                {lastMultiplier.toFixed(2)}×
              </span>
            ) : spots > 0 ? (
              <span className="text-subtle">{previewMultiplier.toFixed(2)}×</span>
            ) : (
              <span className="text-subtle">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <span className="stat-label">Max Payout</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span className="tabular-nums">{potential.toFixed(2)}</span>
          <span className="text-xs font-normal text-subtle">
            {spots > 0 ? `if all ${spots} hit` : 'pick numbers'}
          </span>
        </div>
      </div>

      <Button
        variant="primary"
        className="w-full py-4 text-base"
        disabled={revealing || spots < 1}
        onClick={play}
      >
        {revealing ? 'Drawing…' : 'Play'}
      </Button>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-2xl flex-col items-center gap-5">
        {/* Number grid */}
        <div className="relative w-full">
          <WinBadge show={phase === 'done' && lastPayout > 0} multiplier={lastMultiplier} payout={lastPayout} />
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {Array.from({ length: TOTAL }, (_, i) => i + 1).map((n) => {
              const picked = picks.has(n)
              const isDrawn = revealed.has(n)
              const isHit = picked && isDrawn
              return (
                <motion.button
                  key={n}
                  type="button"
                  disabled={revealing}
                  onClick={() => toggle(n)}
                  whileTap={{ scale: revealing ? 1 : 0.9 }}
                  animate={isDrawn ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                  transition={{ duration: 0.32 }}
                  className={cn(
                    'relative grid aspect-square place-items-center rounded-lg border text-base font-bold tabular-nums transition-colors sm:text-lg',
                    'select-none',
                    isHit
                      ? 'border-gold/70 bg-gradient-to-br from-gold to-amber-500 text-black shadow-glow-win'
                      : isDrawn
                        ? 'border-brand/40 bg-brand/15 text-brand'
                        : picked
                          ? 'border-brand/60 bg-brand-gradient text-white shadow-glow'
                          : 'border-border bg-base text-muted hover:border-brand/40 hover:text-white',
                    revealing && 'cursor-default',
                  )}
                >
                  {n}
                  {isHit && (
                    <motion.span
                      className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-win text-[9px] font-black text-white shadow"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                    >
                      ✓
                    </motion.span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-subtle">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-brand-gradient" /> Pick
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-gradient-to-br from-gold to-amber-500" /> Hit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-brand/40 bg-brand/15" /> Drawn
          </span>
        </div>

        {/* Payout table preview for current spot count */}
        <div className="min-h-[3.25rem] w-full">
          <AnimatePresence mode="wait">
            {spots > 0 ? (
              <motion.div
                key={spots}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="flex w-full flex-wrap justify-center gap-1.5"
              >
                {previewRow.map((row) => {
                  const achieved = phase === 'done' && row.hits === hits
                  const win = row.mult > 0
                  return (
                    <div
                      key={row.hits}
                      className={cn(
                        'flex min-w-[3.4rem] flex-1 flex-col items-center rounded-lg border px-2 py-1.5 transition-colors',
                        achieved
                          ? win
                            ? 'border-win/70 bg-win/15 shadow-glow-win'
                            : 'border-loss/60 bg-loss/15'
                          : 'border-border bg-base/60',
                      )}
                    >
                      <span
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wide',
                          achieved ? 'text-white' : 'text-subtle',
                        )}
                      >
                        {row.hits} hit{row.hits === 1 ? '' : 's'}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums',
                          win ? (achieved ? 'text-gold' : 'text-muted') : 'text-subtle',
                        )}
                      >
                        {row.mult.toFixed(2)}×
                      </span>
                    </div>
                  )
                })}
              </motion.div>
            ) : (
              <div className="text-center text-sm text-subtle">
                Select 1–10 numbers to see the payout table.
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Recent results */}
        {history.length > 0 && (
          <div className="flex h-7 flex-wrap items-center justify-center gap-1.5">
            {history.map((h, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-md px-2 py-1 font-mono text-xs font-semibold',
                  h.win ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss',
                )}
                title={`${h.hits} of ${h.spots} hit`}
              >
                {h.hits}/{h.spots}
              </span>
            ))}
          </div>
        )}
      </div>
    </GameLayout>
  )
}
