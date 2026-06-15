import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Skull, Gem, Lock, Trophy } from 'lucide-react'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { floatToInt } from '@/lib/rng'
import { cn } from '@/lib/cn'

const HOUSE_EDGE = 0.99
const ROWS = 8
const meta = GAMES_BY_ID['towers']

type Difficulty = 'easy' | 'medium' | 'hard'

interface DiffConfig {
  label: string
  tiles: number
  traps: number
  desc: string
}

const DIFFICULTIES: Record<Difficulty, DiffConfig> = {
  easy: { label: 'Easy', tiles: 4, traps: 1, desc: '3 / 4 safe' },
  medium: { label: 'Medium', tiles: 3, traps: 1, desc: '2 / 3 safe' },
  hard: { label: 'Hard', tiles: 2, traps: 1, desc: '1 / 2 safe' },
}

/** Multiplier reached after clearing `n` rows on a board with `tiles` per row. */
function multiplierFor(tiles: number, n: number): number {
  if (n <= 0) return 0
  return round2(HOUSE_EDGE * Math.pow(tiles / (tiles - 1), n))
}

type Phase = 'idle' | 'active' | 'lost' | 'won'

export function Towers() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [phase, setPhase] = useState<Phase>('idle')
  const [traps, setTraps] = useState<number[]>([]) // trapIndex per row
  const [currentRow, setCurrentRow] = useState(0)
  // The tile the player chose on each cleared row (for display). -1 = not chosen.
  const [picks, setPicks] = useState<number[]>([])
  // Difficulty locked in for the active round (controls may differ from the live one).
  const [roundDiff, setRoundDiff] = useState<Difficulty>('easy')
  const [history, setHistory] = useState<{ multiplier: number; win: boolean }[]>([])

  const cfg = DIFFICULTIES[difficulty]
  const activeCfg = DIFFICULTIES[roundDiff]
  const inRound = phase === 'active'
  const cfgForBoard = inRound ? activeCfg : cfg

  const currentMultiplier = multiplierFor(cfgForBoard.tiles, currentRow)
  const nextMultiplier = multiplierFor(cfgForBoard.tiles, Math.min(currentRow + 1, ROWS))
  const maxMultiplier = multiplierFor(cfgForBoard.tiles, ROWS)
  const currentPayout = round2(amount * currentMultiplier)
  const nextPayout = round2(amount * nextMultiplier)

  const endRound = (finalPhase: Phase, mult: number, win: boolean) => {
    setPhase(finalPhase)
    setHistory((h) => [{ multiplier: mult, win }, ...h].slice(0, 12))
  }

  const start = () => {
    if (inRound) return
    if (!bet(amount)) return
    sfx.bet()

    const { floats } = drawFloats(ROWS)
    const drawn = floats.map((f) => floatToInt(f, 0, cfg.tiles - 1))

    setTraps(drawn)
    setPicks(Array(ROWS).fill(-1))
    setCurrentRow(0)
    setRoundDiff(difficulty)
    setPhase('active')
  }

  const pickTile = (row: number, tile: number) => {
    if (phase !== 'active' || row !== currentRow) return

    // Record the chosen tile for this row.
    setPicks((p) => {
      const copy = [...p]
      copy[row] = tile
      return copy
    })

    if (tile === traps[row]) {
      // Trap → lose. Reveal everything.
      sfx.explode()
      const next = currentRow // rows cleared so far
      recordBet({
        game: 'towers',
        gameLabel: 'Towers',
        betAmount: amount,
        multiplier: 0,
        payout: 0,
      })
      endRound('lost', multiplierFor(activeCfg.tiles, next), false)
      return
    }

    // Safe → climb.
    const cleared = row + 1
    if (cleared >= ROWS) {
      // Reached the top — auto win at the max multiplier.
      const mult = maxMultiplier
      const payout = round2(amount * mult)
      credit(payout)
      recordBet({
        game: 'towers',
        gameLabel: 'Towers',
        betAmount: amount,
        multiplier: mult,
        payout,
      })
      setCurrentRow(ROWS)
      sfx.bigWin()
      endRound('won', mult, true)
    } else {
      sfx.reveal()
      setCurrentRow(cleared)
    }
  }

  const cashOut = () => {
    if (phase !== 'active' || currentRow < 1) return
    const mult = currentMultiplier
    const payout = round2(amount * mult)
    credit(payout)
    recordBet({
      game: 'towers',
      gameLabel: 'Towers',
      betAmount: amount,
      multiplier: mult,
      payout,
    })
    sfx.cashout()
    endRound('won', mult, true)
  }

  const reset = () => {
    setPhase('idle')
    setTraps([])
    setPicks([])
    setCurrentRow(0)
  }

  // Rows rendered top (7) → bottom (0) so the player climbs upward.
  const rowOrder = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i)
  const reveal = phase === 'lost' || phase === 'won'
  const canCashOut = inRound && currentRow >= 1

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={inRound} />

      <div>
        <span className="stat-label">Difficulty</span>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
            const dc = DIFFICULTIES[d]
            const selected = (inRound ? roundDiff : difficulty) === d
            return (
              <button
                key={d}
                disabled={inRound}
                onClick={() => {
                  sfx.tick()
                  setDifficulty(d)
                }}
                className={cn(
                  'btn flex-col gap-0.5 rounded-lg py-2 text-sm',
                  selected ? 'bg-brand-gradient text-white' : 'btn-ghost',
                  inRound && 'opacity-50',
                )}
              >
                <span className="font-semibold">{dc.label}</span>
                <span className={cn('text-[10px]', selected ? 'text-white/70' : 'text-subtle')}>
                  {dc.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="stat-label">Current</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
            {currentMultiplier > 0 ? `${currentMultiplier.toFixed(2)}×` : '—'}
          </div>
        </div>
        <div className="space-y-1">
          <span className="stat-label">Next</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold">
            {currentRow < ROWS ? `${nextMultiplier.toFixed(2)}×` : 'MAX'}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <span className="stat-label">{canCashOut ? 'Cash Out' : 'Potential Payout'}</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span>{(canCashOut ? currentPayout : nextPayout).toFixed(2)}</span>
          <span className="text-xs font-normal text-subtle">
            {canCashOut
              ? `profit +${round2(currentPayout - amount).toFixed(2)}`
              : `to ${maxMultiplier.toFixed(2)}×`}
          </span>
        </div>
      </div>

      {canCashOut ? (
        <Button variant="win" className="w-full py-4 text-base" onClick={cashOut}>
          Cash Out {currentPayout.toFixed(2)}
        </Button>
      ) : (
        <Button
          variant="primary"
          className="w-full py-4 text-base"
          disabled={inRound}
          onClick={reveal ? reset : start}
        >
          {reveal ? 'Play Again' : 'Bet'}
        </Button>
      )}
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-md flex-col items-center gap-3">
        {/* Status banner */}
        <div className="flex h-8 items-center justify-center">
          <AnimatePresence mode="wait">
            {phase === 'won' && (
              <motion.div
                key="won"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="chip bg-win/15 text-win"
              >
                <Trophy size={14} /> Cashed out at{' '}
                {history[0] ? history[0].multiplier.toFixed(2) : currentMultiplier.toFixed(2)}×
              </motion.div>
            )}
            {phase === 'lost' && (
              <motion.div
                key="lost"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="chip bg-loss/15 text-loss"
              >
                <Skull size={14} /> Hit a trap!
              </motion.div>
            )}
            {(phase === 'idle' || phase === 'active') && (
              <motion.div
                key="play"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs font-medium text-subtle"
              >
                {inRound
                  ? `Climbing — row ${currentRow + 1} of ${ROWS}`
                  : 'Pick a safe tile on each row to climb'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tower */}
        <div className="w-full space-y-1.5">
          {rowOrder.map((row) => {
            const rowMult = multiplierFor(cfgForBoard.tiles, row + 1)
            const isCurrent = inRound && row === currentRow
            const isCleared = row < currentRow
            const isLocked = !reveal && row > currentRow
            const pick = picks[row]

            return (
              <motion.div
                key={row}
                layout
                className={cn(
                  'flex items-center gap-2 rounded-xl border p-1.5 transition-colors',
                  isCurrent
                    ? 'border-brand/70 bg-brand/10 shadow-glow'
                    : isCleared
                      ? 'border-win/25 bg-win/5'
                      : 'border-border bg-base/40',
                  isLocked && 'opacity-40',
                )}
              >
                {/* Multiplier label */}
                <div
                  className={cn(
                    'w-16 shrink-0 rounded-lg px-1 py-2 text-center text-xs font-bold tabular-nums sm:w-20',
                    isCurrent
                      ? 'bg-brand/20 text-brand-light'
                      : isCleared
                        ? 'text-win'
                        : 'text-subtle',
                  )}
                >
                  {rowMult.toFixed(2)}×
                </div>

                {/* Tiles */}
                <div
                  className="grid flex-1 gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${cfgForBoard.tiles}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: cfgForBoard.tiles }, (_, tile) => {
                    const isTrap = reveal && traps[row] === tile
                    const isPick = pick === tile
                    const pickedSafe = isPick && !isTrap && (isCleared || (reveal && phase === 'won'))
                    const pickedTrap = isPick && isTrap

                    let face: 'blank' | 'safe' | 'trap' = 'blank'
                    if (pickedTrap || (reveal && isTrap)) face = 'trap'
                    else if (pickedSafe || (isCleared && isPick)) face = 'safe'

                    return (
                      <motion.button
                        key={tile}
                        type="button"
                        disabled={!isCurrent}
                        onClick={() => pickTile(row, tile)}
                        whileHover={isCurrent ? { scale: 1.04 } : undefined}
                        whileTap={isCurrent ? { scale: 0.95 } : undefined}
                        className={cn(
                          'relative grid h-9 place-items-center rounded-lg border text-sm font-bold transition-colors sm:h-11',
                          face === 'trap' &&
                            'border-loss/60 bg-loss/20 text-loss',
                          face === 'safe' &&
                            'border-win/60 bg-win/20 text-win',
                          face === 'blank' && isCurrent &&
                            'border-brand/40 bg-elevated text-muted hover:border-brand hover:bg-hover hover:text-white cursor-pointer',
                          face === 'blank' && !isCurrent &&
                            'border-border bg-base/60 text-subtle/40',
                        )}
                      >
                        <AnimatePresence mode="wait">
                          {face === 'safe' && (
                            <motion.span
                              key="g"
                              initial={{ scale: 0, rotate: -30 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: 'spring', stiffness: 360, damping: 16 }}
                            >
                              <Gem size={18} />
                            </motion.span>
                          )}
                          {face === 'trap' && (
                            <motion.span
                              key="s"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 360, damping: 16 }}
                            >
                              <Skull size={18} />
                            </motion.span>
                          )}
                          {face === 'blank' && isLocked && (
                            <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                              <Lock size={14} className="text-subtle/40" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* History pills */}
        <div className="flex h-7 flex-wrap items-center justify-center gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className={cn(
                'rounded-md px-2 py-0.5 font-mono text-xs font-semibold',
                h.win ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss',
              )}
            >
              {h.win ? `${h.multiplier.toFixed(2)}×` : 'BUST'}
            </span>
          ))}
        </div>
      </div>
    </GameLayout>
  )
}
