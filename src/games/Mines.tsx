import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bomb, Gem, Minus, Plus } from 'lucide-react'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { Stat } from '@/components/game/Stat'
import { WinBadge } from '@/components/game/WinBadge'
import { useStore } from '@/store/useStore'
import { round2, clamp } from '@/lib/format'
import { shuffledIndices } from '@/lib/rng'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const HOUSE_EDGE = 0.99
const GRID = 25
const meta = GAMES_BY_ID['mines']

/** Provably-fair multiplier after `picks` safe reveals with `mines` bombs. */
function multiplierFor(picks: number, mines: number): number {
  let fair = 1
  for (let i = 0; i < picks; i++) {
    fair *= (GRID - i) / (GRID - mines - i)
  }
  return round2(HOUSE_EDGE * fair)
}

type Phase = 'idle' | 'active' | 'lost' | 'won'

export function Mines() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [mineCount, setMineCount] = useState(3)
  const [phase, setPhase] = useState<Phase>('idle')
  const [stake, setStake] = useState(0)
  const [mines, setMines] = useState<Set<number>>(new Set())
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [hitTile, setHitTile] = useState<number | null>(null)
  const [badge, setBadge] = useState<{ show: boolean; mult: number; payout: number }>({
    show: false,
    mult: 0,
    payout: 0,
  })

  const active = phase === 'active'
  const ended = phase === 'lost' || phase === 'won'
  const safePicks = revealed.size
  const currentMultiplier = multiplierFor(safePicks, mineCount)
  const nextMultiplier = multiplierFor(safePicks + 1, mineCount)
  const gemsTotal = GRID - mineCount
  const currentPayout = round2(stake * currentMultiplier)
  const profit = round2(currentPayout - stake)
  const canCashOut = active && safePicks > 0

  const setMines_ = (next: number) => {
    if (active) return
    sfx.tick()
    setMineCount(clamp(next, 1, GRID - 1))
  }

  const startRound = () => {
    if (active) return
    if (!bet(amount)) return
    sfx.bet()

    const { serverSeed, clientSeed, nonce } = drawFloats(1)
    const order = shuffledIndices(serverSeed, clientSeed, nonce, GRID)
    const mineSet = new Set(order.slice(0, mineCount))

    setStake(amount)
    setMines(mineSet)
    setRevealed(new Set())
    setHitTile(null)
    setBadge({ show: false, mult: 0, payout: 0 })
    setPhase('active')
  }

  const reveal = (idx: number) => {
    if (!active || revealed.has(idx)) return

    if (mines.has(idx)) {
      sfx.explode()
      sfx.lose()
      setHitTile(idx)
      setPhase('lost')
      recordBet({
        game: 'mines',
        gameLabel: 'Mines',
        betAmount: stake,
        multiplier: 0,
        payout: 0,
      })
      return
    }

    const next = new Set(revealed)
    next.add(idx)
    sfx.reveal()
    setRevealed(next)

    // Auto-win when every safe tile is uncovered.
    if (next.size === gemsTotal) {
      finishWin(next.size)
    }
  }

  const finishWin = (picks: number) => {
    const mult = multiplierFor(picks, mineCount)
    const payout = round2(stake * mult)
    credit(payout)
    ;(payout >= stake * 10 ? sfx.bigWin : sfx.cashout)()
    recordBet({
      game: 'mines',
      gameLabel: 'Mines',
      betAmount: stake,
      multiplier: mult,
      payout,
    })
    setBadge({ show: true, mult, payout })
    setPhase('won')
    setTimeout(() => setBadge((b) => ({ ...b, show: false })), 1800)
  }

  const cashOut = () => {
    if (!canCashOut) return
    finishWin(safePicks)
  }

  const actionLabel = active
    ? canCashOut
      ? `Cash Out ${currentPayout.toFixed(2)}`
      : 'Pick a tile'
    : 'Bet'

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={active} />

      {/* Mines selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="stat-label">Mines</span>
          <span className="text-xs text-subtle">
            Gems: <span className="font-medium text-muted">{gemsTotal}</span>
          </span>
        </div>
        <div className="flex items-stretch gap-1.5">
          <button
            disabled={active || mineCount <= 1}
            onClick={() => setMines_(mineCount - 1)}
            className="btn-ghost grid w-10 place-items-center rounded-lg py-2.5"
            title="Fewer mines"
          >
            <Minus size={15} />
          </button>
          <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-base py-2.5 text-sm font-bold tabular-nums">
            {mineCount}
          </div>
          <button
            disabled={active || mineCount >= GRID - 1}
            onClick={() => setMines_(mineCount + 1)}
            className="btn-ghost grid w-10 place-items-center rounded-lg py-2.5"
            title="More mines"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
          {[1, 3, 5, 10].map((n) => (
            <button
              key={n}
              disabled={active}
              onClick={() => setMines_(n)}
              className={cn(
                'btn rounded-lg py-1.5 text-xs',
                mineCount === n ? 'bg-brand-gradient text-white' : 'btn-ghost',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Multiplier">
          <span className="text-gold">{currentMultiplier.toFixed(2)}×</span>
        </Stat>
        <Stat label="Next Tile">
          <span className="text-win">
            {safePicks + 1 > gemsTotal ? '—' : `${nextMultiplier.toFixed(2)}×`}
          </span>
        </Stat>
      </div>

      <div className="space-y-1">
        <span className="stat-label">{active || ended ? 'Profit' : 'Profit on Cash Out'}</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span>{currentPayout.toFixed(2)}</span>
          <span className="text-xs font-normal text-subtle">
            {safePicks > 0 ? `+${profit.toFixed(2)}` : `+0.00`}
          </span>
        </div>
      </div>

      {active ? (
        <Button
          variant="win"
          className="w-full py-4 text-base"
          disabled={!canCashOut}
          onClick={cashOut}
        >
          {actionLabel}
        </Button>
      ) : (
        <Button variant="primary" className="w-full py-4 text-base" onClick={startRound}>
          {actionLabel}
        </Button>
      )}

      <p className="text-center text-xs text-subtle">
        {active
          ? `${safePicks}/${gemsTotal} gems found`
          : ended
            ? phase === 'won'
              ? 'Cashed out! Place a bet to play again.'
              : 'Boom! Place a bet to play again.'
            : 'Pick your mines, then start digging.'}
      </p>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <div className="grid w-full grid-cols-5 gap-2 sm:gap-2.5">
          {Array.from({ length: GRID }, (_, idx) => {
            const isRevealed = revealed.has(idx)
            const isMine = mines.has(idx)
            const isHit = hitTile === idx
            // Once the round ends, expose the whole board.
            const showFace = isRevealed || (ended && isMine)
            const dimUnpicked = ended && !isRevealed && !isHit

            return (
              <Tile
                key={idx}
                showFace={showFace}
                isMine={isMine}
                isHit={isHit}
                dim={dimUnpicked}
                disabled={!active || isRevealed}
                onClick={() => reveal(idx)}
              />
            )
          })}
        </div>

        <WinBadge show={badge.show} multiplier={badge.mult} payout={badge.payout} />
      </div>
    </GameLayout>
  )
}

interface TileProps {
  showFace: boolean
  isMine: boolean
  isHit: boolean
  dim: boolean
  disabled: boolean
  onClick: () => void
}

function Tile({ showFace, isMine, isHit, dim, disabled, onClick }: TileProps) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { scale: 1.04, y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      animate={isHit ? { x: [0, -5, 5, -4, 4, 0] } : { x: 0 }}
      transition={isHit ? { duration: 0.35 } : { type: 'spring', stiffness: 400, damping: 24 }}
      className={cn(
        'relative grid aspect-square w-full place-items-center rounded-xl border text-2xl transition-colors',
        !showFace &&
          'border-border bg-elevated shadow-inner enabled:hover:border-brand/50 enabled:hover:bg-hover',
        showFace && !isMine && 'border-win/40 bg-win/15',
        showFace && isMine && (isHit ? 'border-loss bg-loss/25' : 'border-loss/40 bg-loss/15'),
        dim && 'opacity-40',
      )}
    >
      <AnimatePresence mode="wait">
        {showFace && (
          <motion.span
            key={isMine ? 'b' : 'g'}
            initial={{ scale: 0, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16 }}
            className={cn('grid place-items-center', isMine ? 'text-loss' : 'text-win')}
          >
            {isMine ? (
              <Bomb size={26} strokeWidth={2.4} />
            ) : (
              <Gem size={26} strokeWidth={2.4} className="drop-shadow-[0_0_8px_rgba(16,217,160,0.5)]" />
            )}
          </motion.span>
        )}
      </AnimatePresence>
      {/* subtle dot on hidden tiles for texture */}
      {!showFace && <span className="h-1.5 w-1.5 rounded-full bg-subtle/30" aria-hidden />}
    </motion.button>
  )
}
