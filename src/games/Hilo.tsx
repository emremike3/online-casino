import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { Stat } from '@/components/game/Stat'
import { WinBadge } from '@/components/game/WinBadge'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { shuffledIndices } from '@/lib/rng'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const HOUSE_EDGE = 0.99
const DECK_SIZE = 52
const meta = GAMES_BY_ID['hilo']

type Phase = 'idle' | 'active' | 'lost' | 'won'
type Guess = 'higher' | 'lower'

const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = [
  { symbol: '♠', red: false },
  { symbol: '♥', red: true },
  { symbol: '♦', red: true },
  { symbol: '♣', red: false },
] as const

interface Card {
  index: number
  rank: number // 0..12
  suit: number // 0..3
  value: number // 2..14
}

function cardFromIndex(index: number): Card {
  const rank = index % 13
  return { index, rank, suit: Math.floor(index / 13), value: rank + 2 }
}

/** Probability the next card is >= the current value (ties count as a win). */
function pHigherEqual(value: number): number {
  return (15 - value) / 13
}

/** Probability the next card is <= the current value (ties count as a win). */
function pLowerEqual(value: number): number {
  return (value - 1) / 13
}

function multFor(p: number): number {
  return round2(HOUSE_EDGE / p)
}

export function Hilo() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [phase, setPhase] = useState<Phase>('idle')
  const [stake, setStake] = useState(0)
  const [deck, setDeck] = useState<number[]>([])
  const [pointer, setPointer] = useState(0)
  const [multiplier, setMultiplier] = useState(1)
  const [history, setHistory] = useState<Card[]>([])
  const [lastGuess, setLastGuess] = useState<Guess | null>(null)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [badge, setBadge] = useState<{ show: boolean; mult: number; payout: number }>({
    show: false,
    mult: 0,
    payout: 0,
  })

  const active = phase === 'active'
  const ended = phase === 'lost' || phase === 'won'
  const current = deck.length ? cardFromIndex(deck[pointer]) : null
  // Leave one card so we can always reveal a "next" card without running out.
  const deckExhausted = active && pointer >= DECK_SIZE - 1

  const pHE = current ? pHigherEqual(current.value) : 0
  const pLE = current ? pLowerEqual(current.value) : 0
  const higherMult = current ? multFor(pHE) : 0
  const lowerMult = current ? multFor(pLE) : 0

  const guesses = pointer // number of correct guesses so far this round
  const canCashOut = active && guesses > 0
  const currentPayout = round2(stake * multiplier)
  const profit = round2(currentPayout - stake)

  const startRound = () => {
    if (active) return
    if (!bet(amount)) return
    sfx.bet()

    const { serverSeed, clientSeed, nonce } = drawFloats(1)
    const order = shuffledIndices(serverSeed, clientSeed, nonce, DECK_SIZE)

    setStake(amount)
    setDeck(order)
    setPointer(0)
    setMultiplier(1)
    setHistory([cardFromIndex(order[0])])
    setLastGuess(null)
    setLastCorrect(null)
    setBadge({ show: false, mult: 0, payout: 0 })
    setPhase('active')
    sfx.card()
  }

  const guess = (dir: Guess) => {
    if (!active || !current || deckExhausted) return

    const nextPointer = pointer + 1
    const next = cardFromIndex(deck[nextPointer])
    const correct = dir === 'higher' ? next.value >= current.value : next.value <= current.value
    const stepMult = dir === 'higher' ? higherMult : lowerMult

    sfx.card()
    setPointer(nextPointer)
    setLastGuess(dir)
    setLastCorrect(correct)
    setHistory((h) => [...h, next].slice(-7))

    if (correct) {
      setMultiplier((m) => round2(m * stepMult))
      sfx.reveal()
    } else {
      sfx.lose()
      setPhase('lost')
      recordBet({
        game: 'hilo',
        gameLabel: 'Hi-Lo',
        betAmount: stake,
        multiplier: 0,
        payout: 0,
      })
    }
  }

  const cashOut = () => {
    if (!canCashOut) return
    const payout = round2(stake * multiplier)
    credit(payout)
    ;(payout >= stake * 10 ? sfx.bigWin : sfx.win)()
    sfx.cashout()
    recordBet({
      game: 'hilo',
      gameLabel: 'Hi-Lo',
      betAmount: stake,
      multiplier,
      payout,
    })
    setBadge({ show: true, mult: multiplier, payout })
    setPhase('won')
    setTimeout(() => setBadge((b) => ({ ...b, show: false })), 1800)
  }

  const statusText = active
    ? deckExhausted
      ? 'Deck cleared! Cash out to bank your win.'
      : `${guesses} correct · pick higher or lower`
    : phase === 'won'
      ? 'Cashed out! Place a bet to play again.'
      : phase === 'lost'
        ? 'Busted! Place a bet to play again.'
        : 'Place a bet to draw your first card.'

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={active} />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Multiplier">
          <span className="text-gold">{multiplier.toFixed(2)}×</span>
        </Stat>
        <Stat label="Correct">
          <span className="text-win">{guesses}</span>
        </Stat>
      </div>

      <div className="space-y-1">
        <span className="stat-label">{active || ended ? 'Profit' : 'Profit on Cash Out'}</span>
        <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
          <span>{currentPayout.toFixed(2)}</span>
          <span className="text-xs font-normal text-subtle">
            {guesses > 0 ? `+${profit.toFixed(2)}` : '+0.00'}
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
          {canCashOut ? `Cash Out ${currentPayout.toFixed(2)}` : 'Guess to begin'}
        </Button>
      ) : (
        <Button variant="primary" className="w-full py-4 text-base" onClick={startRound}>
          Bet
        </Button>
      )}

      <p className="text-center text-xs text-subtle">{statusText}</p>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-xl flex-col items-center gap-6 sm:gap-8">
        {/* Card stage: past cards stacked behind, current card front and center */}
        <div className="relative flex h-44 w-full items-center justify-center sm:h-52">
          {/* History stack behind the current card */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
            {history.slice(0, -1).map((c, i, arr) => {
              const fromEnd = arr.length - 1 - i // 0 = most recent past card
              return (
                <div
                  key={`${c.index}-${i}`}
                  className="absolute"
                  style={{
                    transform: `translateX(${-(fromEnd + 1) * 30}px) scale(${Math.max(
                      0.6,
                      0.82 - fromEnd * 0.07,
                    )})`,
                    opacity: Math.max(0.18, 0.6 - fromEnd * 0.13),
                    zIndex: -fromEnd,
                  }}
                >
                  <PlayingCard card={c} size="sm" />
                </div>
              )
            })}
          </div>

          {/* Current card with flip-in animation keyed on pointer */}
          <AnimatePresence mode="popLayout">
            {current && (
              <motion.div
                key={pointer}
                initial={{ rotateY: -90, opacity: 0, x: 60, scale: 0.9 }}
                animate={{ rotateY: 0, opacity: 1, x: 0, scale: 1 }}
                exit={{ rotateY: 90, opacity: 0, x: -40, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                className="relative z-10"
                style={{ transformStyle: 'preserve-3d', perspective: 800 }}
              >
                <PlayingCard
                  card={current}
                  size="lg"
                  glow={
                    phase === 'lost'
                      ? 'loss'
                      : lastCorrect && active
                        ? 'win'
                        : phase === 'won'
                          ? 'win'
                          : 'none'
                  }
                />
              </motion.div>
            )}
            {!current && (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="z-10"
              >
                <CardBack />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Guess buttons with live multipliers + implied odds */}
        <div className="grid w-full grid-cols-2 gap-3">
          <GuessButton
            dir="higher"
            mult={higherMult}
            chance={pHE}
            disabled={!active || deckExhausted}
            highlight={lastGuess === 'higher'}
            onClick={() => guess('higher')}
          />
          <GuessButton
            dir="lower"
            mult={lowerMult}
            chance={pLE}
            disabled={!active || deckExhausted}
            highlight={lastGuess === 'lower'}
            onClick={() => guess('lower')}
          />
        </div>

        {/* Recent-results history pills */}
        <div className="flex h-8 flex-wrap items-center justify-center gap-1.5">
          {history.map((c, i) => (
            <span
              key={`${c.index}-pill-${i}`}
              className={cn(
                'flex items-center gap-0.5 rounded-md px-2 py-1 font-mono text-xs font-semibold',
                SUITS[c.suit].red ? 'text-loss' : 'text-white',
                'bg-elevated',
              )}
            >
              {RANK_LABELS[c.rank]}
              {SUITS[c.suit].symbol}
            </span>
          ))}
        </div>

        <WinBadge show={badge.show} multiplier={badge.mult} payout={badge.payout} />
      </div>
    </GameLayout>
  )
}

interface GuessButtonProps {
  dir: Guess
  mult: number
  chance: number
  disabled: boolean
  highlight: boolean
  onClick: () => void
}

function GuessButton({ dir, mult, chance, disabled, highlight, onClick }: GuessButtonProps) {
  const isHigher = dir === 'higher'
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { scale: 1.02, y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        isHigher
          ? 'border-win/40 bg-win/10 enabled:hover:border-win/70 enabled:hover:bg-win/20'
          : 'border-brand/40 bg-brand/10 enabled:hover:border-brand/70 enabled:hover:bg-brand/20',
        highlight && (isHigher ? 'ring-2 ring-win/60' : 'ring-2 ring-brand/60'),
      )}
    >
      <span className="flex w-full items-center justify-center gap-1.5 text-sm font-bold">
        {isHigher ? (
          <>
            Higher <ChevronUp size={18} className="text-win" />
          </>
        ) : (
          <>
            Lower <ChevronDown size={18} className="text-brand" />
          </>
        )}
      </span>
      <span className="text-lg font-extrabold tabular-nums text-gold">{mult.toFixed(2)}×</span>
      <span className="text-xs font-medium text-subtle">{(chance * 100).toFixed(1)}% chance</span>
    </motion.button>
  )
}

type Glow = 'none' | 'win' | 'loss'

interface PlayingCardProps {
  card: Card
  size: 'sm' | 'lg'
  glow?: Glow
}

function PlayingCard({ card, size, glow = 'none' }: PlayingCardProps) {
  const suit = SUITS[card.suit]
  const label = RANK_LABELS[card.rank]
  const lg = size === 'lg'

  return (
    <div
      className={cn(
        'relative flex flex-col justify-between rounded-2xl bg-white text-slate-900 ring-1 ring-black/10',
        lg ? 'h-40 w-28 p-3 sm:h-48 sm:w-32 sm:p-4' : 'h-28 w-20 p-2',
        glow === 'win' && 'shadow-glow-win',
        glow === 'loss' && 'shadow-[0_0_24px_rgba(239,68,68,0.45)]',
        glow === 'none' && 'shadow-xl',
      )}
    >
      {/* top-left rank/suit */}
      <div className={cn('flex flex-col items-start leading-none', suit.red ? 'text-rose-600' : 'text-slate-900')}>
        <span className={cn('font-extrabold', lg ? 'text-xl sm:text-2xl' : 'text-base')}>{label}</span>
        <span className={cn(lg ? 'text-lg sm:text-xl' : 'text-sm')}>{suit.symbol}</span>
      </div>

      {/* center pip */}
      <span
        className={cn(
          'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-bold',
          suit.red ? 'text-rose-600' : 'text-slate-900',
          lg ? 'text-5xl sm:text-6xl' : 'text-3xl',
        )}
      >
        {suit.symbol}
      </span>

      {/* bottom-right rank/suit (rotated) */}
      <div
        className={cn(
          'flex flex-col items-end self-end leading-none',
          suit.red ? 'text-rose-600' : 'text-slate-900',
        )}
        style={{ transform: 'rotate(180deg)' }}
      >
        <span className={cn('font-extrabold', lg ? 'text-xl sm:text-2xl' : 'text-base')}>{label}</span>
        <span className={cn(lg ? 'text-lg sm:text-xl' : 'text-sm')}>{suit.symbol}</span>
      </div>
    </div>
  )
}

function CardBack() {
  return (
    <div className="grid h-40 w-28 place-items-center rounded-2xl border border-border bg-elevated shadow-xl sm:h-48 sm:w-32">
      <div
        className="h-[88%] w-[86%] rounded-xl border border-brand/30"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(124,92,255,0.18) 0 8px, rgba(124,92,255,0.06) 8px 16px)',
        }}
      />
    </div>
  )
}
