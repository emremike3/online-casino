import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { shuffledIndices } from '@/lib/rng'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const meta = GAMES_BY_ID['blackjack']

// ---- Card model -----------------------------------------------------------
// card index 0..51 → rank = index % 13 (0=A … 12=K), suit = floor(index/13).

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
const SUITS = ['♠', '♥', '♦', '♣'] as const

function rankOf(card: number): number {
  return card % 13
}
function suitOf(card: number): number {
  return Math.floor(card / 13)
}
function isRedSuit(card: number): boolean {
  const s = suitOf(card)
  return s === 1 || s === 2 // ♥ ♦
}
/** Base card value: A=11, 2..9 face, 10/J/Q/K = 10. */
function cardValue(card: number): number {
  const r = rankOf(card)
  if (r === 0) return 11
  if (r >= 9) return 10
  return r + 1
}

interface HandTotal {
  total: number
  soft: boolean
}

/** Sum a hand, demoting Aces from 11→1 while busting. "Soft" if an Ace is still 11. */
function handTotal(cards: number[]): HandTotal {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += cardValue(c)
    if (rankOf(c) === 0) aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

function isBlackjack(cards: number[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21
}

/** True while the dealer must keep drawing (stand on all 17, incl. soft 17). */
function dealerShouldHit(cards: number[]): boolean {
  return handTotal(cards).total < 17
}

type Phase = 'idle' | 'player' | 'dealer' | 'done'
type Outcome = 'win' | 'lose' | 'push' | 'blackjack'

interface ResultInfo {
  outcome: Outcome
  payout: number
  multiplier: number
}

const DEAL_STEP = 260 // ms between staggered deal animations

export function Blackjack() {
  const bet = useStore((s) => s.bet)
  const balance = useStore((s) => s.balance)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [phase, setPhase] = useState<Phase>('idle')
  const [stake, setStake] = useState(0)
  const [doubled, setDoubled] = useState(false)
  const [player, setPlayer] = useState<number[]>([])
  const [dealer, setDealer] = useState<number[]>([])
  const [holeHidden, setHoleHidden] = useState(true)
  const [result, setResult] = useState<ResultInfo | null>(null)
  const [history, setHistory] = useState<Outcome[]>([])
  const [busy, setBusy] = useState(false) // locks input during animated sequences

  // Remaining deck for the current round, advanced via a pointer.
  const [deck, setDeck] = useState<number[]>([])
  const [pointer, setPointer] = useState(0)

  const roundActive = phase !== 'idle'
  const inputLocked = busy || phase === 'dealer'

  const playerScore = handTotal(player)
  const dealerScore = handTotal(dealer)
  const dealerVisible = holeHidden ? dealer.slice(0, 1) : dealer
  const dealerShown = handTotal(dealerVisible)

  const canDouble =
    phase === 'player' && !busy && player.length === 2 && balance + 1e-9 >= stake

  // ---- settlement ---------------------------------------------------------

  const settle = (
    finalPlayer: number[],
    finalDealer: number[],
    totalStake: number,
    playerNatural: boolean,
  ): ResultInfo => {
    const p = handTotal(finalPlayer).total
    const d = handTotal(finalDealer).total
    const dealerNatural = isBlackjack(finalDealer)

    let outcome: Outcome
    let payout: number

    if (p > 21) {
      outcome = 'lose'
      payout = 0
    } else if (playerNatural && !dealerNatural) {
      outcome = 'blackjack'
      payout = round2(totalStake * 2.5)
    } else if (playerNatural && dealerNatural) {
      outcome = 'push'
      payout = totalStake
    } else if (dealerNatural) {
      outcome = 'lose'
      payout = 0
    } else if (d > 21 || p > d) {
      outcome = 'win'
      payout = round2(totalStake * 2)
    } else if (p === d) {
      outcome = 'push'
      payout = totalStake
    } else {
      outcome = 'lose'
      payout = 0
    }

    const multiplier = totalStake > 0 ? round2(payout / totalStake) : 0
    return { outcome, payout, multiplier }
  }

  const finishRound = (
    finalPlayer: number[],
    finalDealer: number[],
    totalStake: number,
    playerNatural: boolean,
  ) => {
    const info = settle(finalPlayer, finalDealer, totalStake, playerNatural)
    if (info.payout > 0) credit(info.payout)
    recordBet({
      game: 'blackjack',
      gameLabel: 'Blackjack',
      betAmount: totalStake,
      multiplier: info.outcome === 'push' ? 0 : info.multiplier,
      payout: info.payout,
    })

    if (info.outcome === 'blackjack') sfx.bigWin()
    else if (info.outcome === 'win') sfx.win()
    else if (info.outcome === 'lose') sfx.lose()
    else sfx.reveal()

    setResult(info)
    setHistory((h) => [info.outcome, ...h].slice(0, 10))
    setPhase('done')
    setBusy(false)
  }

  // ---- dealer turn --------------------------------------------------------

  const runDealer = (
    startDealer: number[],
    deckRef: number[],
    startPointer: number,
    finalPlayer: number[],
    totalStake: number,
  ) => {
    setPhase('dealer')
    setBusy(true)
    setHoleHidden(false)
    sfx.reveal()

    let hand = [...startDealer]
    let ptr = startPointer
    let delay = 420 // pause to let the hole-card flip read first

    const drawNext = () => {
      if (dealerShouldHit(hand)) {
        const card = deckRef[ptr]
        ptr += 1
        hand = [...hand, card]
        const snapshot = [...hand]
        const ptrSnapshot = ptr
        setTimeout(() => {
          sfx.card()
          setDealer(snapshot)
          setPointer(ptrSnapshot)
          drawNext()
        }, delay)
        delay = DEAL_STEP
      } else {
        setTimeout(() => {
          finishRound(finalPlayer, hand, totalStake, false)
        }, delay)
      }
    }

    drawNext()
  }

  // ---- actions ------------------------------------------------------------

  const deal = () => {
    if (roundActive || busy) return
    if (!bet(amount)) return

    const { serverSeed, clientSeed, nonce } = drawFloats(1)
    const freshDeck = shuffledIndices(serverSeed, clientSeed, nonce, 52)

    // Deal order: player, dealer, player, dealer.
    const p0 = freshDeck[0]
    const d0 = freshDeck[1]
    const p1 = freshDeck[2]
    const d1 = freshDeck[3]
    const playerHand = [p0, p1]
    const dealerHand = [d0, d1]

    setDeck(freshDeck)
    setPointer(4)
    setStake(amount)
    setDoubled(false)
    setResult(null)
    setHoleHidden(true)
    setPlayer([])
    setDealer([])
    setPhase('player')
    setBusy(true)
    sfx.bet()

    // Stagger the four opening cards in.
    setTimeout(() => {
      sfx.card()
      setPlayer([p0])
    }, 60)
    setTimeout(() => {
      sfx.card()
      setDealer([d0])
    }, 60 + DEAL_STEP)
    setTimeout(() => {
      sfx.card()
      setPlayer([p0, p1])
    }, 60 + DEAL_STEP * 2)
    setTimeout(() => {
      sfx.card()
      setDealer([d0, d1])

      // After the deal, peek for naturals.
      const playerNat = isBlackjack(playerHand)
      const dealerUp = dealerHand[0]
      const dealerPeeks = rankOf(dealerUp) === 0 || cardValue(dealerUp) === 10
      const dealerNat = dealerPeeks && isBlackjack(dealerHand)

      if (playerNat || dealerNat) {
        // Reveal and settle immediately on any natural.
        setHoleHidden(false)
        setTimeout(() => {
          finishRound(playerHand, dealerHand, amount, playerNat)
        }, 480)
      } else {
        setBusy(false)
      }
    }, 60 + DEAL_STEP * 3)
  }

  const hit = () => {
    if (phase !== 'player' || inputLocked) return
    const card = deck[pointer]
    const nextHand = [...player, card]
    const nextPointer = pointer + 1
    sfx.card()
    setPlayer(nextHand)
    setPointer(nextPointer)

    if (handTotal(nextHand).total > 21) {
      // Bust → reveal dealer hole card for clarity, then settle as a loss.
      setBusy(true)
      setHoleHidden(false)
      setTimeout(() => {
        finishRound(nextHand, dealer, doubled ? stake * 2 : stake, false)
      }, 480)
    }
  }

  const stand = () => {
    if (phase !== 'player' || inputLocked) return
    const totalStake = doubled ? stake * 2 : stake
    runDealer(dealer, deck, pointer, player, totalStake)
  }

  const double = () => {
    if (!canDouble) return
    if (!bet(stake)) return
    setDoubled(true)
    setBusy(true)

    const card = deck[pointer]
    const nextHand = [...player, card]
    const nextPointer = pointer + 1
    const totalStake = stake * 2

    setTimeout(() => {
      sfx.card()
      setPlayer(nextHand)
      setPointer(nextPointer)

      if (handTotal(nextHand).total > 21) {
        setHoleHidden(false)
        setTimeout(() => finishRound(nextHand, dealer, totalStake, false), 480)
      } else {
        runDealer(dealer, deck, nextPointer, nextHand, totalStake)
      }
    }, 120)
  }

  // ---- derived UI labels --------------------------------------------------

  const totalWagered = doubled ? round2(stake * 2) : stake

  const bannerText: Record<Outcome, string> = {
    blackjack: 'Blackjack!',
    win: 'You Win',
    push: 'Push',
    lose: 'Dealer Wins',
  }
  const bannerClass: Record<Outcome, string> = {
    blackjack: 'border-gold/60 bg-gold/15 text-gold',
    win: 'border-win/50 bg-win/15 text-win',
    push: 'border-border bg-elevated text-muted',
    lose: 'border-loss/50 bg-loss/15 text-loss',
  }

  // ---- controls -----------------------------------------------------------

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={roundActive} label="Bet Amount" />

      {!roundActive && (
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 5, 25, 100].map((chip) => (
            <button
              key={chip}
              onClick={() => {
                sfx.tick()
                setAmount(round2(chip))
              }}
              className="btn-ghost rounded-lg py-1.5 text-xs font-semibold"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="stat-label">Wagered</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold tabular-nums">
            {(roundActive ? totalWagered : amount).toFixed(2)}
          </div>
        </div>
        <div className="space-y-1">
          <span className="stat-label">Blackjack</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold text-gold">
            3 : 2
          </div>
        </div>
      </div>

      {phase === 'player' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="primary"
              className="w-full py-3.5 text-sm"
              disabled={inputLocked}
              onClick={hit}
            >
              Hit
            </Button>
            <Button
              variant="win"
              className="w-full py-3.5 text-sm"
              disabled={inputLocked}
              onClick={stand}
            >
              Stand
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full py-3 text-sm"
            disabled={!canDouble}
            onClick={double}
          >
            Double {canDouble ? `(${round2(stake * 2).toFixed(2)})` : ''}
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          className="w-full py-4 text-base"
          disabled={inputLocked}
          onClick={deal}
        >
          {phase === 'dealer' ? 'Dealer…' : phase === 'done' ? 'Deal Again' : 'Deal'}
        </Button>
      )}

      <p className="text-center text-xs text-subtle">
        {phase === 'idle'
          ? 'Beat the dealer to 21 without busting.'
          : phase === 'player'
            ? 'Hit, stand, or double down.'
            : phase === 'dealer'
              ? 'Dealer is drawing…'
              : result
                ? result.outcome === 'push'
                  ? 'Push — your stake is returned.'
                  : result.outcome === 'lose'
                    ? 'Place a bet to play again.'
                    : `Paid ${result.payout.toFixed(2)}. Deal again!`
                : ''}
      </p>
    </div>
  )

  // ---- board --------------------------------------------------------------

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-2xl flex-col items-stretch gap-4">
        {/* Felt table */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-900/40 bg-gradient-to-b from-emerald-800/30 via-emerald-900/30 to-emerald-950/40 p-5 shadow-inner sm:p-7">
          {/* table arc / dealer line */}
          <div
            className="pointer-events-none absolute inset-x-6 top-24 h-40 rounded-[100%] border border-emerald-300/10 sm:top-28"
            aria-hidden
          />

          {/* Dealer */}
          <HandRow
            label="Dealer"
            cards={dealer}
            hideIndices={holeHidden ? [1] : []}
            total={holeHidden ? dealerShown.total : dealerScore.total}
            soft={holeHidden ? dealerShown.soft : dealerScore.soft}
            showTotal={dealer.length > 0}
            partial={holeHidden}
            bust={!holeHidden && dealerScore.total > 21}
          />

          {/* Result banner */}
          <div className="my-4 grid h-12 place-items-center">
            <AnimatePresence mode="wait">
              {result && (
                <motion.div
                  key={result.outcome}
                  initial={{ opacity: 0, scale: 0.7, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-5 py-2 text-base font-extrabold uppercase tracking-wide',
                    bannerClass[result.outcome],
                  )}
                >
                  {bannerText[result.outcome]}
                  {result.payout > 0 && result.outcome !== 'push' && (
                    <span className="text-sm font-bold opacity-90">+{round2(result.payout - totalWagered).toFixed(2)}</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Player */}
          <HandRow
            label="You"
            cards={player}
            hideIndices={[]}
            total={playerScore.total}
            soft={playerScore.soft}
            showTotal={player.length > 0}
            highlight
            bust={playerScore.total > 21}
            blackjack={phase !== 'idle' && isBlackjack(player)}
          />
        </div>

        {/* History */}
        <div className="flex min-h-7 flex-wrap items-center justify-center gap-1.5">
          {history.map((o, i) => (
            <span
              key={i}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-bold uppercase',
                o === 'blackjack' && 'bg-gold/15 text-gold',
                o === 'win' && 'bg-win/15 text-win',
                o === 'lose' && 'bg-loss/15 text-loss',
                o === 'push' && 'bg-elevated text-muted',
              )}
            >
              {o === 'blackjack' ? 'BJ' : o === 'win' ? 'W' : o === 'lose' ? 'L' : 'P'}
            </span>
          ))}
        </div>
      </div>
    </GameLayout>
  )
}

// ---- sub-components --------------------------------------------------------

interface HandRowProps {
  label: string
  cards: number[]
  hideIndices: number[]
  total: number
  soft: boolean
  showTotal: boolean
  partial?: boolean
  highlight?: boolean
  bust?: boolean
  blackjack?: boolean
}

function HandRow({
  label,
  cards,
  hideIndices,
  total,
  soft,
  showTotal,
  partial,
  highlight,
  bust,
  blackjack,
}: HandRowProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100/70">
          {label}
        </span>
        {showTotal && (
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-xs font-bold tabular-nums',
              bust
                ? 'bg-loss/25 text-loss'
                : blackjack
                  ? 'bg-gold/20 text-gold'
                  : highlight
                    ? 'bg-white/15 text-white'
                    : 'bg-black/25 text-emerald-50',
            )}
          >
            {blackjack ? 'BJ' : `${soft && !partial ? 'Soft ' : ''}${total}${partial ? '+' : ''}`}
          </span>
        )}
      </div>
      <div className="flex min-h-[5.5rem] items-center justify-center gap-1.5 sm:min-h-[6.5rem] sm:gap-2">
        <AnimatePresence initial={false}>
          {cards.length === 0 ? (
            <div className="h-20 w-14 rounded-lg border border-dashed border-white/15 sm:h-24 sm:w-16" />
          ) : (
            cards.map((card, i) => (
              <PlayingCard key={`${card}-${i}`} card={card} faceDown={hideIndices.includes(i)} index={i} />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

interface PlayingCardProps {
  card: number
  faceDown: boolean
  index: number
}

function PlayingCard({ card, faceDown, index }: PlayingCardProps) {
  const rank = RANK_LABELS[rankOf(card)]
  const suit = SUITS[suitOf(card)]
  const red = isRedSuit(card)

  return (
    <motion.div
      initial={{ opacity: 0, y: -28, rotateZ: -8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, rotateZ: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, delay: index * 0.02 }}
      className="relative h-20 w-14 sm:h-24 sm:w-16"
      style={{ perspective: 600 }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: faceDown ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-lg border border-black/10 bg-white p-1.5 shadow-md"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span
            className={cn('text-sm font-bold leading-none sm:text-base', red ? 'text-red-600' : 'text-zinc-900')}
          >
            {rank}
          </span>
          <span className={cn('text-center text-xl leading-none sm:text-2xl', red ? 'text-red-600' : 'text-zinc-900')}>
            {suit}
          </span>
          <span
            className={cn(
              'self-end rotate-180 text-sm font-bold leading-none sm:text-base',
              red ? 'text-red-600' : 'text-zinc-900',
            )}
          >
            {rank}
          </span>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 grid place-items-center rounded-lg border border-emerald-300/20 bg-gradient-to-br from-emerald-700 to-emerald-900 shadow-md"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="h-[80%] w-[80%] rounded-md border border-emerald-300/30 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.08)_0,rgba(255,255,255,0.08)_3px,transparent_3px,transparent_6px)]" />
        </div>
      </motion.div>
    </motion.div>
  )
}
