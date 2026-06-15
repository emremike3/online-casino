import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, Trash2 } from 'lucide-react'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { floatToInt } from '@/lib/rng'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/cn'

const meta = GAMES_BY_ID['roulette']

/* ----------------------------------------------------------------------------
 * Wheel / table constants
 * ------------------------------------------------------------------------- */

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

/** Standard European single-zero pocket order (clockwise). */
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]
const POCKETS = WHEEL_ORDER.length // 37
const POCKET_DEG = 360 / POCKETS

type Color = 'red' | 'black' | 'green'

function colorOf(n: number): Color {
  if (n === 0) return 'green'
  return REDS.has(n) ? 'red' : 'black'
}

/**
 * Betting-table grid: 3 rows × 12 columns of numbers 1..36.
 * Top row is the "3,6,9…" column-bet, middle "2,5,8…", bottom "1,4,7…".
 */
const GRID_ROWS: number[][] = [
  Array.from({ length: 12 }, (_, c) => c * 3 + 3),
  Array.from({ length: 12 }, (_, c) => c * 3 + 2),
  Array.from({ length: 12 }, (_, c) => c * 3 + 1),
]

const CHIP_VALUES = [1, 5, 25, 100] as const
type ChipValue = (typeof CHIP_VALUES)[number]

/* ----------------------------------------------------------------------------
 * Bet model
 * ------------------------------------------------------------------------- */

type BetKey =
  | `straight:${number}`
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high'
  | `dozen:${number}`
  | `col:${number}`

interface BetDef {
  /** Winnings-to-stake. Total returned on win = stake * (payout + 1). */
  payout: number
  /** Does this bet win for the drawn number? */
  wins: (n: number) => boolean
}

function betDef(key: BetKey): BetDef {
  if (key.startsWith('straight:')) {
    const num = Number(key.slice('straight:'.length))
    return { payout: 35, wins: (n) => n === num }
  }
  if (key.startsWith('dozen:')) {
    const d = Number(key.slice('dozen:'.length)) // 0,1,2
    const lo = d * 12 + 1
    const hi = lo + 11
    return { payout: 2, wins: (n) => n >= lo && n <= hi }
  }
  if (key.startsWith('col:')) {
    // col index 0 = top row (3,6,…), 1 = middle (2,5,…), 2 = bottom (1,4,…)
    const c = Number(key.slice('col:'.length))
    const rem = (3 - c) % 3 // top→0, middle→2, bottom→1
    return { payout: 2, wins: (n) => n !== 0 && n % 3 === rem }
  }
  switch (key) {
    case 'red':
      return { payout: 1, wins: (n) => colorOf(n) === 'red' }
    case 'black':
      return { payout: 1, wins: (n) => colorOf(n) === 'black' }
    case 'even':
      return { payout: 1, wins: (n) => n !== 0 && n % 2 === 0 }
    case 'odd':
      return { payout: 1, wins: (n) => n % 2 === 1 }
    case 'low':
      return { payout: 1, wins: (n) => n >= 1 && n <= 18 }
    case 'high':
      return { payout: 1, wins: (n) => n >= 19 && n <= 36 }
  }
  // Unreachable in practice (all BetKey shapes handled above), keeps TS exhaustive.
  return { payout: 0, wins: () => false }
}

type Bets = Partial<Record<BetKey, number>>

interface HistoryItem {
  num: number
  color: Color
}

/* ----------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export function Roulette() {
  const balance = useStore((s) => s.balance)
  const bet = useStore((s) => s.bet)
  const credit = useStore((s) => s.credit)
  const drawFloats = useStore((s) => s.drawFloats)
  const recordBet = useStore((s) => s.recordBet)

  const [chip, setChip] = useState<ChipValue>(5)
  const [bets, setBets] = useState<Bets>({})
  // each placed chip, in order, so Undo removes exactly the last one
  const [order, setOrder] = useState<{ key: BetKey; amount: number }[]>([])
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<number | null>(null)
  const [netWin, setNetWin] = useState<number | null>(null) // profit of last resolved spin
  const [winningKeys, setWinningKeys] = useState<Set<BetKey>>(new Set())
  const [history, setHistory] = useState<HistoryItem[]>([])
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalStake = useMemo(
    () => round2(Object.values(bets).reduce<number>((a, b) => a + (b ?? 0), 0)),
    [bets],
  )
  const canAfford = totalStake > 0 && totalStake <= balance + 1e-9

  /** Max possible return for the current layout (if every bet hit). */
  const potential = useMemo(() => {
    let max = 0
    for (const [k, stake] of Object.entries(bets) as [BetKey, number][]) {
      max = Math.max(max, round2(stake * (betDef(k).payout + 1)))
    }
    return max
  }, [bets])

  const place = (key: BetKey) => {
    if (spinning) return
    sfx.tick()
    setBets((prev) => ({ ...prev, [key]: round2((prev[key] ?? 0) + chip) }))
    setOrder((prev) => [...prev, { key, amount: chip }])
    // a fresh placement after a result clears the "resolved" highlight
    setNetWin(null)
    setWinningKeys((prev) => (prev.size ? new Set() : prev))
  }

  const undo = () => {
    if (spinning || order.length === 0) return
    sfx.click()
    const last = order[order.length - 1]
    setOrder((prev) => prev.slice(0, -1))
    setBets((prev) => {
      const next = { ...prev }
      const remaining = round2((next[last.key] ?? 0) - last.amount)
      if (remaining > 0) next[last.key] = remaining
      else delete next[last.key]
      return next
    })
  }

  const clearAll = () => {
    if (spinning) return
    sfx.click()
    setBets({})
    setOrder([])
    setNetWin(null)
    setWinningKeys(new Set())
  }

  const spin = () => {
    if (spinning || !canAfford) return
    if (!bet(totalStake)) return

    setSpinning(true)
    setNetWin(null)
    setWinningKeys(new Set())
    sfx.spin()

    const { floats } = drawFloats(1)
    const num = floatToInt(floats[0], 0, 36)

    // Rotate so the result pocket lands under the top pointer.
    const pocketIndex = WHEEL_ORDER.indexOf(num)
    const targetBase = -(pocketIndex * POCKET_DEG)
    setRotation((prev) => {
      const current = ((prev % 360) + 360) % 360
      const targetMod = ((targetBase % 360) + 360) % 360
      let delta = targetMod - current
      if (delta <= 0) delta += 360
      return prev + delta + 360 * 5 // 5 full turns + settle
    })

    spinTimer.current = setTimeout(() => {
      // Resolve every placed bet.
      let totalReturn = 0
      const winners = new Set<BetKey>()
      for (const [k, stake] of Object.entries(bets) as [BetKey, number][]) {
        const def = betDef(k)
        if (def.wins(num)) {
          totalReturn += stake * (def.payout + 1)
          winners.add(k)
        }
      }
      totalReturn = round2(totalReturn)
      if (totalReturn > 0) credit(totalReturn)

      const multiplier = totalStake > 0 ? round2(totalReturn / totalStake) : 0
      recordBet({
        game: 'roulette',
        gameLabel: 'Roulette',
        betAmount: totalStake,
        multiplier,
        payout: totalReturn,
      })

      const profit = round2(totalReturn - totalStake)
      setResult(num)
      setNetWin(profit)
      setWinningKeys(winners)
      setHistory((h) => [{ num, color: colorOf(num) }, ...h].slice(0, 14))

      if (profit > 0) (totalReturn >= totalStake * 5 ? sfx.bigWin : sfx.win)()
      else if (profit < 0) sfx.lose()
      else sfx.reveal()

      setSpinning(false)
    }, 3600)
  }

  /* ---- sub-renderers --------------------------------------------------- */

  const resultColor = result === null ? null : colorOf(result)

  const cellClasses = (key: BetKey, base: string) =>
    cn(
      base,
      'relative select-none transition-transform',
      spinning ? 'cursor-not-allowed' : 'cursor-pointer hover:brightness-125 active:scale-[0.97]',
      winningKeys.has(key) && 'z-10 ring-2 ring-gold shadow-glow animate-pulse-glow',
    )

  const NumberCell = ({ n }: { n: number }) => {
    const c = colorOf(n)
    const key: BetKey = `straight:${n}`
    const isResult = result === n
    return (
      <button
        type="button"
        disabled={spinning}
        onClick={() => place(key)}
        className={cellClasses(
          key,
          cn(
            'grid aspect-square place-items-center rounded-[3px] text-[11px] font-bold text-white sm:text-sm',
            c === 'red' && 'bg-loss/90',
            c === 'black' && 'bg-elevated border border-border',
            isResult && 'outline outline-2 outline-gold',
          ),
        )}
      >
        {n}
        <ChipBadge amount={bets[key]} />
      </button>
    )
  }

  const OutsideCell = ({
    keyName,
    label,
    className,
  }: {
    keyName: BetKey
    label: string
    className?: string
  }) => (
    <button
      type="button"
      disabled={spinning}
      onClick={() => place(keyName)}
      className={cellClasses(
        keyName,
        cn(
          'grid place-items-center rounded-[4px] border border-border bg-elevated px-1 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted sm:text-xs',
          className,
        ),
      )}
    >
      {label}
      <ChipBadge amount={bets[keyName]} />
    </button>
  )

  /* ---- controls panel -------------------------------------------------- */

  const controls = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="stat-label">Chip Size</span>
        <span className="text-xs text-subtle">
          Balance: <span className="font-medium text-muted">{balance.toFixed(2)}</span>
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {CHIP_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              sfx.tick()
              setChip(v)
            }}
            className={cn(
              'grid aspect-square place-items-center rounded-full border-2 text-sm font-extrabold transition-all active:scale-95',
              chip === v
                ? 'border-gold bg-gold/15 text-gold shadow-glow'
                : 'border-border bg-elevated text-muted hover:text-white',
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="stat-label">Total Staked</span>
          <div
            className={cn(
              'rounded-lg border bg-base px-3 py-2.5 text-sm font-bold tabular-nums',
              canAfford || totalStake === 0 ? 'border-border text-gold' : 'border-loss/60 text-loss',
            )}
          >
            {totalStake.toFixed(2)}
          </div>
        </div>
        <div className="space-y-1">
          <span className="stat-label">Max Payout</span>
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-bold tabular-nums text-muted">
            {potential.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="ghost"
          className="w-full"
          disabled={spinning || order.length === 0}
          onClick={undo}
        >
          <RotateCcw size={15} /> Undo
        </Button>
        <Button
          variant="danger"
          className="w-full"
          disabled={spinning || totalStake === 0}
          onClick={clearAll}
        >
          <Trash2 size={15} /> Clear
        </Button>
      </div>

      <Button
        variant="primary"
        className="w-full py-4 text-base"
        disabled={spinning || !canAfford}
        onClick={spin}
      >
        {spinning ? 'Spinning…' : 'Spin'}
      </Button>

      <div className="space-y-1">
        <span className="stat-label">Last Result</span>
        {result === null ? (
          <div className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-subtle">
            Place chips, then spin.
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-border bg-base px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ResultDot color={resultColor!} />
              {result} <span className="capitalize text-subtle">{resultColor}</span>
            </span>
            {netWin !== null && (
              <span
                className={cn(
                  'text-sm font-bold tabular-nums',
                  netWin > 0 ? 'text-win' : netWin < 0 ? 'text-loss' : 'text-muted',
                )}
              >
                {netWin > 0 ? '+' : ''}
                {netWin.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )

  /* ---- board ----------------------------------------------------------- */

  return (
    <GameLayout game={meta} controls={controls}>
      <div className="flex w-full max-w-2xl flex-col items-center gap-6">
        {/* Wheel */}
        <Wheel rotation={rotation} result={result} spinning={spinning} />

        {/* Recent results */}
        <div className="flex h-7 flex-wrap items-center justify-center gap-1.5">
          {history.length === 0 ? (
            <span className="text-xs text-subtle">No spins yet</span>
          ) : (
            history.map((h, i) => (
              <span
                key={i}
                className={cn(
                  'grid h-6 min-w-6 place-items-center rounded-md px-1.5 font-mono text-xs font-bold text-white',
                  h.color === 'red' && 'bg-loss/90',
                  h.color === 'black' && 'bg-elevated border border-border',
                  h.color === 'green' && 'bg-win/80 text-black',
                )}
              >
                {h.num}
              </span>
            ))
          )}
        </div>

        {/* Betting table */}
        <div className="w-full overflow-x-auto pb-1">
          <div className="mx-auto min-w-[460px] max-w-xl">
            <div className="flex gap-1">
              {/* Zero spans all three rows */}
              <button
                type="button"
                disabled={spinning}
                onClick={() => place('straight:0')}
                className={cellClasses(
                  'straight:0',
                  cn(
                    'grid w-9 place-items-center rounded-[4px] bg-win/80 text-sm font-bold text-black sm:w-11',
                    result === 0 && 'outline outline-2 outline-gold',
                  ),
                )}
              >
                0
                <ChipBadge amount={bets['straight:0']} />
              </button>

              <div className="flex-1 space-y-1">
                {/* Number rows + column bets */}
                {GRID_ROWS.map((row, r) => (
                  <div key={r} className="flex gap-1">
                    <div className="grid flex-1 grid-cols-12 gap-1">
                      {row.map((n) => (
                        <NumberCell key={n} n={n} />
                      ))}
                    </div>
                    <OutsideCell
                      keyName={`col:${r}`}
                      label="2:1"
                      className="w-9 sm:w-11"
                    />
                  </div>
                ))}

                {/* Dozens */}
                <div className="grid grid-cols-3 gap-1 pr-10 sm:pr-12">
                  <OutsideCell keyName="dozen:0" label="1st 12" />
                  <OutsideCell keyName="dozen:1" label="2nd 12" />
                  <OutsideCell keyName="dozen:2" label="3rd 12" />
                </div>

                {/* Even-money outside bets */}
                <div className="grid grid-cols-6 gap-1 pr-10 sm:pr-12">
                  <OutsideCell keyName="low" label="1-18" />
                  <OutsideCell keyName="even" label="Even" />
                  <OutsideCell
                    keyName="red"
                    label="Red"
                    className="border-loss/50 bg-loss/30 text-white"
                  />
                  <OutsideCell
                    keyName="black"
                    label="Black"
                    className="border-border bg-base text-white"
                  />
                  <OutsideCell keyName="odd" label="Odd" />
                  <OutsideCell keyName="high" label="19-36" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GameLayout>
  )
}

/* ----------------------------------------------------------------------------
 * Small presentational helpers
 * ------------------------------------------------------------------------- */

function ChipBadge({ amount }: { amount?: number }) {
  if (!amount) return null
  return (
    <span className="pointer-events-none absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border border-base bg-gold px-0.5 text-[8px] font-extrabold leading-none text-black shadow sm:h-5 sm:min-w-5 sm:text-[9px]">
      {amount}
    </span>
  )
}

function ResultDot({ color }: { color: Color }) {
  return (
    <span
      className={cn(
        'inline-block h-3 w-3 rounded-full',
        color === 'red' && 'bg-loss',
        color === 'black' && 'bg-white/70',
        color === 'green' && 'bg-win',
      )}
    />
  )
}

function Wheel({
  rotation,
  result,
  spinning,
}: {
  rotation: number
  result: number | null
  spinning: boolean
}) {
  // Pre-compute conic-gradient stops so the disc shows the pocket coloring.
  const gradient = useMemo(() => {
    const stops = WHEEL_ORDER.map((n, i) => {
      const c = colorOf(n)
      const hex = c === 'green' ? '#00b894' : c === 'red' ? '#ff3b59' : '#1a1d29'
      const from = (i * POCKET_DEG).toFixed(3)
      const to = ((i + 1) * POCKET_DEG).toFixed(3)
      return `${hex} ${from}deg ${to}deg`
    })
    return `conic-gradient(from 0deg, ${stops.join(', ')})`
  }, [])

  const resultColor = result === null ? null : colorOf(result)

  return (
    <div className="relative grid h-56 w-56 place-items-center sm:h-64 sm:w-64">
      {/* Pointer */}
      <div className="absolute -top-1 left-1/2 z-30 -translate-x-1/2">
        <div className="h-0 w-0 border-x-[9px] border-t-[14px] border-x-transparent border-t-gold drop-shadow" />
      </div>

      {/* Outer ring glow */}
      <div className="absolute inset-0 rounded-full bg-base shadow-card ring-1 ring-border" />

      {/* Spinning disc */}
      <motion.div
        className="absolute inset-2 rounded-full"
        style={{ background: gradient }}
        animate={{ rotate: rotation }}
        transition={{ duration: 3.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* thin pocket separators via inner ring */}
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-black/40" />
      </motion.div>

      {/* Hub with result */}
      <div className="absolute inset-[34%] grid place-items-center rounded-full border border-border bg-base/95 backdrop-blur">
        {result === null ? (
          <span className="text-xs font-semibold text-subtle">Spin</span>
        ) : (
          <motion.div
            key={`${result}-${spinning}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: spinning ? 0.85 : 1, opacity: 1 }}
            className={cn(
              'text-2xl font-extrabold tabular-nums sm:text-3xl',
              resultColor === 'red' && 'text-loss',
              resultColor === 'black' && 'text-white',
              resultColor === 'green' && 'text-win',
            )}
          >
            {result}
          </motion.div>
        )}
      </div>
    </div>
  )
}
