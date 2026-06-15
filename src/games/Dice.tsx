import { useState } from 'react'
import { motion } from 'framer-motion'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const HOUSE_EDGE = 0.99
const meta = GAMES_BY_ID['dice']

type Mode = 'under' | 'over'

export function Dice() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [target, setTarget] = useState(50)
  const [mode, setMode] = useState<Mode>('under')
  const [result, setResult] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const [lastWin, setLastWin] = useState<boolean | null>(null)
  const [history, setHistory] = useState<{ value: number; win: boolean }[]>([])

  const winChance = mode === 'under' ? target : 100 - target
  const multiplier = round2((100 / winChance) * HOUSE_EDGE)
  const payout = round2(amount * multiplier)

  const play = () => {
    if (rolling) return
    if (!bet(amount)) return
    setRolling(true)
    sfx.bet()

    const { floats } = drawFloats(1)
    const roll = round2(floats[0] * 100)
    const win = mode === 'under' ? roll < target : roll > target

    // brief suspense before revealing
    setTimeout(() => {
      setResult(roll)
      setLastWin(win)
      setHistory((h) => [{ value: roll, win }, ...h].slice(0, 12))
      const won = win ? payout : 0
      if (won > 0) credit(won)
      recordBet({
        game: 'dice',
        gameLabel: 'Dice',
        betAmount: amount,
        multiplier: win ? multiplier : 0,
        payout: won,
      })
      if (win) (payout >= amount * 10 ? sfx.bigWin : sfx.win)()
      else sfx.lose()
      setRolling(false)
    }, 350)
  }

  const markerPos = result ?? 50

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={rolling} />

      <div>
        <span className="stat-label">Roll Mode</span>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(['under', 'over'] as Mode[]).map((m) => (
            <button
              key={m}
              disabled={rolling}
              onClick={() => {
                sfx.tick()
                setMode(m)
              }}
              className={cn(
                'btn rounded-lg py-2.5 text-sm capitalize',
                mode === m ? 'bg-brand-gradient text-white' : 'btn-ghost',
              )}
            >
              Roll {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="stat-label">Multiplier</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold">
            {multiplier.toFixed(2)}×
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
          <span className="text-xs font-normal text-subtle">profit +{(payout - amount).toFixed(2)}</span>
        </div>
      </div>

      <Button variant="primary" className="w-full py-4 text-base" disabled={rolling} onClick={play}>
        {rolling ? 'Rolling…' : 'Roll Dice'}
      </Button>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-xl flex-col items-center gap-10">
        {/* Result readout */}
        <div className="h-20 text-center">
          {result !== null ? (
            <motion.div
              key={result + (lastWin ? 'w' : 'l')}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                'text-6xl font-extrabold tabular-nums',
                lastWin ? 'text-win' : 'text-loss',
              )}
            >
              {result.toFixed(2)}
            </motion.div>
          ) : (
            <div className="text-6xl font-extrabold tabular-nums text-subtle/40">00.00</div>
          )}
        </div>

        {/* Slider track */}
        <div className="w-full px-2">
          <div className="relative h-3 rounded-full bg-loss/80">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-win/80"
              style={{
                width: mode === 'under' ? `${target}%` : `${100 - target}%`,
                left: mode === 'under' ? 0 : 'auto',
                right: mode === 'over' ? 0 : 'auto',
              }}
            />
            {/* result marker */}
            {result !== null && (
              <motion.div
                className="absolute -top-1.5 z-10"
                initial={{ left: `${markerPos}%` }}
                animate={{ left: `${markerPos}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                style={{ translateX: '-50%' }}
              >
                <div
                  className={cn(
                    'h-6 w-6 rounded-md border-2 border-white shadow-lg',
                    lastWin ? 'bg-win' : 'bg-loss',
                  )}
                />
              </motion.div>
            )}
            {/* target handle */}
            <input
              type="range"
              min={2}
              max={98}
              step={0.5}
              value={target}
              disabled={rolling}
              onChange={(e) => setTarget(parseFloat(e.target.value))}
              className="absolute -top-2 h-7 w-full cursor-pointer appearance-none bg-transparent
                         [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-5
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-md
                         [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:shadow-glow
                         [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                         [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-md
                         [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand"
            />
          </div>
          <div className="mt-3 flex justify-between text-xs font-semibold text-subtle">
            {[0, 25, 50, 75, 100].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
          <div className="mt-2 text-center text-sm font-semibold text-muted">
            Roll {mode} <span className="text-white">{target.toFixed(2)}</span>
          </div>
        </div>

        {/* History pills */}
        <div className="flex h-8 flex-wrap items-center justify-center gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className={cn(
                'rounded-md px-2 py-1 font-mono text-xs font-semibold',
                h.win ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss',
              )}
            >
              {h.value.toFixed(2)}
            </span>
          ))}
        </div>
      </div>
    </GameLayout>
  )
}
