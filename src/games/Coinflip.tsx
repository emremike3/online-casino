import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { Stat } from '@/components/game/Stat'
import { WinBadge } from '@/components/game/WinBadge'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const meta = GAMES_BY_ID['coinflip']
const FLIP_MULTIPLIER = 1.98 // 2× game with a 1% house edge
const FLIP_MS = 1000

type Side = 'heads' | 'tails'
type Phase = 'idle' | 'flipping' | 'won' | 'lost'
type Result = { side: Side; win: boolean }

export function Coinflip() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [side, setSide] = useState<Side>('heads')
  const [phase, setPhase] = useState<Phase>('idle')
  const [stake, setStake] = useState(0)
  const [streak, setStreak] = useState(0)
  // Total accumulated rotation in degrees; always a multiple of 180 once a flip
  // settles, so the resting face is exact (even half-turns = heads, odd = tails).
  const [rotation, setRotation] = useState(0)
  const [history, setHistory] = useState<Result[]>([])
  const [badge, setBadge] = useState<{ show: boolean; mult: number; payout: number }>({
    show: false,
    mult: 0,
    payout: 0,
  })

  const flipping = phase === 'flipping'
  const active = phase === 'won' // a round in progress, awaiting cash out / flip again
  const cumulativeMultiplier = round2(Math.pow(FLIP_MULTIPLIER, streak))
  const currentPotential = round2(stake * cumulativeMultiplier)
  const nextPotential = round2(stake * round2(Math.pow(FLIP_MULTIPLIER, streak + 1)))

  // Run one flip. `firstFlip` deducts the stake (start of round); later flips
  // risk the accumulated winnings, so they never call bet() again.
  const doFlip = (firstFlip: boolean) => {
    if (flipping) return

    let roundStake = stake
    if (firstFlip) {
      if (!bet(amount)) return
      roundStake = amount
      setStake(amount)
      setStreak(0)
    }

    const { floats } = drawFloats(1)
    const outcome: Side = floats[0] < 0.5 ? 'heads' : 'tails'
    const win = outcome === side

    setBadge((b) => ({ ...b, show: false }))
    setPhase('flipping')
    sfx.coin()

    // Spin several full turns, then land on the face matching `outcome`.
    // Heads rests at an even multiple of 180°, tails at an odd one.
    setRotation((r) => {
      const half = Math.round(r / 180) // current resting half-turn count
      const wantOdd = outcome === 'tails' ? 1 : 0
      let target = half + 10 // ~5 full spins forward
      if (target % 2 !== wantOdd) target += 1
      return target * 180
    })

    window.setTimeout(() => {
      setHistory((h) => [{ side: outcome, win }, ...h].slice(0, 14))

      if (win) {
        const newStreak = (firstFlip ? 0 : streak) + 1
        setStreak(newStreak)
        setPhase('won')
        const mult = round2(Math.pow(FLIP_MULTIPLIER, newStreak))
        const potential = round2(roundStake * mult)
        ;(potential >= roundStake * 10 ? sfx.bigWin : sfx.win)()
        setBadge({ show: true, mult, payout: potential })
        window.setTimeout(() => setBadge((b) => ({ ...b, show: false })), 1400)
      } else {
        // Lose everything that was at risk.
        sfx.lose()
        recordBet({
          game: 'coinflip',
          gameLabel: 'Coinflip',
          betAmount: roundStake,
          multiplier: 0,
          payout: 0,
        })
        setPhase('lost')
      }
    }, FLIP_MS)
  }

  const cashOut = () => {
    if (!active) return
    const payout = round2(stake * cumulativeMultiplier)
    credit(payout)
    sfx.cashout()
    recordBet({
      game: 'coinflip',
      gameLabel: 'Coinflip',
      betAmount: stake,
      multiplier: cumulativeMultiplier,
      payout,
    })
    setBadge({ show: true, mult: cumulativeMultiplier, payout })
    window.setTimeout(() => setBadge((b) => ({ ...b, show: false })), 1600)
    setPhase('idle')
    setStreak(0)
  }

  const pickSide = (next: Side) => {
    if (flipping) return
    sfx.tick()
    setSide(next)
  }

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={flipping || active} />

      {/* Side selector */}
      <div>
        <span className="stat-label">Pick a Side</span>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(['heads', 'tails'] as Side[]).map((s) => (
            <button
              key={s}
              disabled={flipping}
              onClick={() => pickSide(s)}
              className={cn(
                'btn flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold capitalize',
                side === s
                  ? s === 'heads'
                    ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-black shadow-glow'
                    : 'bg-gradient-to-br from-slate-300 to-slate-500 text-black shadow-glow'
                  : 'btn-ghost',
              )}
            >
              <span
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full text-xs font-black',
                  side === s
                    ? 'bg-black/20'
                    : s === 'heads'
                      ? 'bg-gold/20 text-gold'
                      : 'bg-slate-400/20 text-slate-300',
                )}
              >
                {s === 'heads' ? 'H' : 'T'}
              </span>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Streak">
          <span className="tabular-nums">{active ? streak : 0}</span>
        </Stat>
        <Stat label="Multiplier">
          <span className="text-gold">{(active ? cumulativeMultiplier : 1).toFixed(2)}×</span>
        </Stat>
      </div>

      <div className="space-y-1">
        <span className="stat-label">{active ? 'Cash Out Value' : 'Win Multiplier'}</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span>{(active ? currentPotential : round2(amount * FLIP_MULTIPLIER)).toFixed(2)}</span>
          <span className="text-xs font-normal text-subtle">
            {active ? `next ${nextPotential.toFixed(2)}` : `${FLIP_MULTIPLIER.toFixed(2)}× per flip`}
          </span>
        </div>
      </div>

      {active ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="win" className="py-4 text-sm" onClick={cashOut}>
            Cash Out {currentPotential.toFixed(2)}
          </Button>
          <Button
            variant="primary"
            className="py-4 text-sm"
            disabled={flipping}
            onClick={() => doFlip(false)}
          >
            Flip Again ×{FLIP_MULTIPLIER.toFixed(2)}
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          className="w-full py-4 text-base"
          disabled={flipping}
          onClick={() => doFlip(true)}
        >
          {flipping ? 'Flipping…' : 'Flip'}
        </Button>
      )}

      <p className="text-center text-xs text-subtle">
        {flipping
          ? 'The coin is in the air…'
          : active
            ? `${streak} in a row — cash out or risk it all.`
            : phase === 'lost'
              ? 'Wrong side! Place a bet to try again.'
              : 'Heads or tails — double or nothing.'}
      </p>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        {/* Coin */}
        <div className="relative grid h-48 w-48 place-items-center [perspective:1000px] sm:h-56 sm:w-56">
          <motion.div
            className="relative h-full w-full [transform-style:preserve-3d]"
            animate={{ rotateY: rotation }}
            transition={{ duration: FLIP_MS / 1000, ease: [0.33, 0, 0.2, 1] }}
          >
            <CoinFace side="heads" />
            <CoinFace side="tails" />
          </motion.div>

          <WinBadge show={badge.show} multiplier={badge.mult} payout={badge.payout} />
        </div>

        {/* Streak readout */}
        <div className="h-7 text-center">
          <AnimatePresence mode="wait">
            {active && streak > 0 && (
              <motion.div
                key={streak}
                initial={{ scale: 0.5, opacity: 0, y: 6 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-lg font-extrabold text-gold"
              >
                {cumulativeMultiplier.toFixed(2)}× · streak {streak}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recent results */}
        <div className="flex h-8 flex-wrap items-center justify-center gap-1.5">
          {history.length === 0 && <span className="text-xs text-subtle">No flips yet</span>}
          {history.map((h, i) => (
            <span
              key={i}
              className={cn(
                'grid h-7 w-7 place-items-center rounded-full text-xs font-black ring-1',
                h.win
                  ? 'bg-win/15 text-win ring-win/40'
                  : 'bg-loss/15 text-loss ring-loss/40',
              )}
              title={`${h.side} — ${h.win ? 'win' : 'loss'}`}
            >
              {h.side === 'heads' ? 'H' : 'T'}
            </span>
          ))}
        </div>
      </div>
    </GameLayout>
  )
}

/** One face of the 3D coin. Tails is pre-rotated 180° on the back. */
function CoinFace({ side }: { side: Side }) {
  const isHeads = side === 'heads'
  return (
    <div
      className="absolute inset-0 grid place-items-center rounded-full border-4 shadow-2xl [backface-visibility:hidden]"
      style={{ transform: isHeads ? undefined : 'rotateY(180deg)' }}
    >
      <div
        className={cn(
          'grid h-full w-full place-items-center rounded-full border-4',
          isHeads
            ? 'border-yellow-200/70 bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600'
            : 'border-slate-200/70 bg-gradient-to-br from-slate-200 via-slate-300 to-slate-500',
        )}
      >
        <span
          className={cn(
            'select-none text-7xl font-black tracking-tight drop-shadow sm:text-8xl',
            isHeads ? 'text-amber-800/80' : 'text-slate-700/80',
          )}
        >
          {isHeads ? 'H' : 'T'}
        </span>
      </div>
    </div>
  )
}
