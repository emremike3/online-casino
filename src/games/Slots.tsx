import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { floatToInt } from '@/lib/rng'

const meta = GAMES_BY_ID['slots']

const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'] as const

/** 3-of-a-kind multiplier applied to a single line's stake. */
const PAYTABLE: Record<string, number> = {
  '🍒': 2,
  '🍋': 3,
  '🔔': 5,
  '⭐': 8,
  '💎': 15,
  '7️⃣': 40,
}

const LINES = 5
const REELS = 3
const ROWS = 3
const STAGGER = 250 // ms between each reel settling
const SPIN_LEAD = 550 // ms the first reel stays spinning before settling

/** Each payline as a list of [row, col] cells on the 3x3 grid. */
const PAYLINES: { id: string; cells: [number, number][] }[] = [
  { id: 'row0', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'row1', cells: [[1, 0], [1, 1], [1, 2]] },
  { id: 'row2', cells: [[2, 0], [2, 1], [2, 2]] },
  { id: 'diag-tlbr', cells: [[0, 0], [1, 1], [2, 2]] },
  { id: 'diag-bltr', cells: [[2, 0], [1, 1], [0, 2]] },
]

type Grid = number[][] // [row][col] -> symbol index

interface WinLine {
  id: string
  symbol: number
  payout: number
  cells: [number, number][]
}

const emptyGrid = (): Grid =>
  Array.from({ length: ROWS }, () => Array.from({ length: REELS }, () => 0))

function evaluate(grid: Grid, lineStake: number): WinLine[] {
  const wins: WinLine[] = []
  for (const line of PAYLINES) {
    const [a, b, c] = line.cells
    const s = grid[a[0]][a[1]]
    if (s === grid[b[0]][b[1]] && s === grid[c[0]][c[1]]) {
      const sym = SYMBOLS[s]
      wins.push({
        id: line.id,
        symbol: s,
        payout: round2(lineStake * PAYTABLE[sym]),
        cells: line.cells,
      })
    }
  }
  return wins
}

/** A vertical reel that blurs through symbols, then settles on its final column. */
function Reel({
  finalColumn,
  spinning,
  winningRows,
}: {
  finalColumn: number[] // 3 symbol indices, top→bottom
  spinning: boolean
  winningRows: Set<number>
}) {
  return (
    <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-base/70">
      {/* subtle inner vignette for depth */}
      <div className="pointer-events-none absolute inset-0 z-20 rounded-xl shadow-[inset_0_12px_24px_-12px_rgba(0,0,0,0.9),inset_0_-12px_24px_-12px_rgba(0,0,0,0.9)]" />

      {spinning ? (
        <motion.div
          className="flex flex-col"
          animate={{ y: ['0%', '-50%'] }}
          transition={{ duration: 0.18, ease: 'linear', repeat: Infinity }}
        >
          {/* two stacked copies of a long random-ish strip for a seamless loop */}
          {[0, 1].map((copy) => (
            <div key={copy} className="flex flex-col">
              {Array.from({ length: 6 }, (_, i) => (
                <Cell key={`${copy}-${i}`} symbol={SYMBOLS[(i * 2 + copy) % SYMBOLS.length]} />
              ))}
            </div>
          ))}
        </motion.div>
      ) : (
        <motion.div
          className="flex flex-col"
          initial={{ y: -40, opacity: 0.4 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          {finalColumn.map((idx, row) => (
            <Cell key={row} symbol={SYMBOLS[idx]} winning={winningRows.has(row)} />
          ))}
        </motion.div>
      )}
    </div>
  )
}

function Cell({ symbol, winning }: { symbol: string; winning?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-[clamp(56px,16vw,88px)] items-center justify-center transition-colors duration-300',
        winning && 'bg-win/15',
      )}
    >
      <motion.span
        className={cn(
          'select-none text-[clamp(30px,9vw,52px)] leading-none drop-shadow',
          winning && 'drop-shadow-[0_0_14px_rgba(40,220,150,0.85)]',
        )}
        animate={
          winning
            ? { scale: [1, 1.18, 1] }
            : { scale: 1 }
        }
        transition={
          winning
            ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
        }
      >
        {symbol}
      </motion.span>
    </div>
  )
}

export function Slots() {
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [amount, setAmount] = useState(1)
  const [grid, setGrid] = useState<Grid>(emptyGrid)
  const [settled, setSettled] = useState<boolean[]>([true, true, true]) // per-reel
  const [spinning, setSpinning] = useState(false)
  const [winLines, setWinLines] = useState<WinLine[]>([])
  const [result, setResult] = useState<{ payout: number; multiplier: number } | null>(null)
  const [history, setHistory] = useState<{ payout: number; win: boolean; multiplier: number }[]>([])

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Cells (per reel) that belong to a winning line — drives the glow.
  const winningCellsByReel = useMemo(() => {
    const map: Set<number>[] = [new Set(), new Set(), new Set()]
    for (const line of winLines) {
      for (const [row, col] of line.cells) map[col].add(row)
    }
    return map
  }, [winLines])

  const spin = () => {
    if (spinning) return
    if (!bet(amount)) return

    // clear any pending timers from a previous spin
    timers.current.forEach(clearTimeout)
    timers.current = []

    sfx.spin()
    setSpinning(true)
    setSettled([false, false, false])
    setWinLines([])
    setResult(null)

    const { floats } = drawFloats(REELS * ROWS)
    const next: Grid = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: REELS }, (_, c) => floatToInt(floats[r * REELS + c], 0, SYMBOLS.length - 1)),
    )

    const lineStake = amount / LINES
    const wins = evaluate(next, lineStake)
    const totalPayout = round2(wins.reduce((sum, w) => sum + w.payout, 0))
    const multiplier = amount > 0 ? round2(totalPayout / amount) : 0

    // Reveal the grid immediately so settling reels land on the real symbols.
    setGrid(next)

    // Settle reels one-by-one, left → right.
    for (let c = 0; c < REELS; c++) {
      const t = setTimeout(() => {
        setSettled((prev) => {
          const copy = [...prev]
          copy[c] = true
          return copy
        })
        sfx.tick()
      }, SPIN_LEAD + c * STAGGER)
      timers.current.push(t)
    }

    // After the last reel settles, resolve the round.
    const finish = setTimeout(() => {
      setSpinning(false)
      setWinLines(wins)
      setResult({ payout: totalPayout, multiplier })
      setHistory((h) =>
        [{ payout: totalPayout, win: totalPayout > 0, multiplier }, ...h].slice(0, 10),
      )

      if (totalPayout > 0) credit(totalPayout)
      recordBet({
        game: 'slots',
        gameLabel: 'Slots',
        betAmount: amount,
        multiplier,
        payout: totalPayout,
      })

      if (totalPayout > 0) (multiplier >= 10 ? sfx.bigWin : sfx.win)()
      else sfx.lose()
    }, SPIN_LEAD + (REELS - 1) * STAGGER + 260)
    timers.current.push(finish)
  }

  const won = result !== null && result.payout > 0

  const controls = (
    <div className="space-y-4">
      <BetAmount value={amount} onChange={setAmount} disabled={spinning} />

      {/* Paytable legend */}
      <div className="space-y-1.5">
        <span className="stat-label">Paytable — 3 of a kind</span>
        <div className="grid grid-cols-3 gap-1.5">
          {SYMBOLS.map((sym) => (
            <div
              key={sym}
              className="flex items-center justify-between gap-1 rounded-lg border border-border bg-base px-2 py-1.5"
            >
              <span className="text-lg leading-none">{sym}</span>
              <span className="font-mono text-xs font-bold text-gold">{PAYTABLE[sym]}×</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-subtle">
          Each of the 5 lines stakes {(amount / LINES).toFixed(2)}. Wins pay the line stake × the
          symbol value.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="stat-label">Lines</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold">
            {LINES}
          </div>
        </div>
        <div className="space-y-1">
          <span className="stat-label">Last Win</span>
          <div
            className={cn(
              'rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold tabular-nums',
              won ? 'text-gold' : 'text-subtle',
            )}
          >
            {result ? result.payout.toFixed(2) : '0.00'}
          </div>
        </div>
      </div>

      <Button variant="primary" className="w-full py-4 text-base" disabled={spinning} onClick={spin}>
        {spinning ? 'Spinning…' : 'Spin'}
      </Button>
    </div>
  )

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-xl flex-col items-center gap-6">
        {/* Reel cabinet */}
        <div className="relative w-full">
          <div className="rounded-2xl border border-border bg-gradient-to-b from-elevated to-base/60 p-3 shadow-glow sm:p-4">
            <div className="flex gap-2 sm:gap-3">
              {Array.from({ length: REELS }, (_, c) => (
                <Reel
                  key={c}
                  spinning={spinning && !settled[c]}
                  finalColumn={[grid[0][c], grid[1][c], grid[2][c]]}
                  winningRows={winningCellsByReel[c]}
                />
              ))}
            </div>
          </div>

          {/* Win pop */}
          <AnimatePresence>
            {won && result && (
              <motion.div
                key={`${result.payout}-${result.multiplier}`}
                className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
                initial={{ opacity: 0, scale: 0.5, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -20 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              >
                <div className="flex flex-col items-center gap-1 rounded-2xl border-2 border-win/60 bg-base/85 px-7 py-4 shadow-glow-win backdrop-blur-md">
                  <span className="text-3xl font-extrabold text-win">{result.multiplier.toFixed(2)}×</span>
                  <span className="text-sm font-semibold text-win/90">+{result.payout.toFixed(2)}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Status line */}
        <div className="flex h-8 items-center text-center text-sm font-semibold">
          {spinning ? (
            <span className="text-muted">Spinning the reels…</span>
          ) : result ? (
            won ? (
              <span className="text-win">
                {winLines.length} line{winLines.length > 1 ? 's' : ''} hit · won{' '}
                {result.payout.toFixed(2)}
              </span>
            ) : (
              <span className="text-loss">No win — spin again</span>
            )
          ) : (
            <span className="text-subtle">Spin to play 5 paylines</span>
          )}
        </div>

        {/* Recent results */}
        <div className="flex h-8 flex-wrap items-center justify-center gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className={cn(
                'rounded-md px-2 py-1 font-mono text-xs font-semibold',
                h.win ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss',
              )}
            >
              {h.win ? `${h.multiplier.toFixed(2)}×` : '—'}
            </span>
          ))}
        </div>
      </div>
    </GameLayout>
  )
}
