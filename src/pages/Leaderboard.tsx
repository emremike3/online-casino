import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Crown } from 'lucide-react'
import { GAMES } from '@/data/games'
import { PLAYER_NAMES } from '@/data/players'
import { formatMoney, formatMultiplier, round2 } from '@/lib/format'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/cn'

type Period = 'today' | 'week'

interface Entry {
  name: string
  game: string
  bet: number
  multiplier: number
  win: number
  isYou?: boolean
}

/* Deterministic PRNG so the board is stable for a given day/week instead of
   reshuffling on every render or reload. */
function hashSeed(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fakeEntries(seedKey: string, scale: number, count: number): Entry[] {
  const rand = mulberry32(hashSeed(seedKey))
  const names = [...PLAYER_NAMES]
  const entries: Entry[] = []
  for (let i = 0; i < count; i++) {
    const name = names.splice(Math.floor(rand() * names.length), 1)[0] + (Math.floor(rand() * 900) + 100)
    const game = GAMES[Math.floor(rand() * GAMES.length)].name
    // heavier tail at the top of the board
    const multiplier = round2(1.5 + Math.pow(rand(), 2.2) * 95 * scale)
    const bet = round2(5 + rand() * 400 * scale)
    entries.push({ name, game, bet, multiplier, win: round2(bet * (multiplier - 1)) })
  }
  return entries.sort((a, b) => b.win - a.win)
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function periodSeed(period: Period): string {
  const now = new Date()
  if (period === 'today') return `today:${now.toISOString().slice(0, 10)}`
  const week = Math.floor(now.getTime() / (7 * 86400_000))
  return `week:${week}`
}

const MEDALS = ['text-gold', 'text-slate-300', 'text-amber-600']

export function Leaderboard() {
  const [period, setPeriod] = useState<Period>('today')
  const history = useStore((s) => s.history)

  const entries = useMemo(() => {
    const since = period === 'today' ? startOfToday() : Date.now() - 7 * 86400_000
    const fakes = fakeEntries(periodSeed(period), period === 'today' ? 1 : 3, 11)

    // Your biggest win in the period competes for a spot on the board.
    const best = history
      .filter((b) => b.win && b.time >= since)
      .reduce<Entry | null>(
        (top, b) =>
          !top || b.profit > top.win
            ? { name: 'You', game: b.gameLabel, bet: b.betAmount, multiplier: b.multiplier, win: b.profit, isYou: true }
            : top,
        null,
      )

    const all = best ? [...fakes, best] : fakes
    return all.sort((a, b) => b.win - a.win).slice(0, 12)
  }, [period, history])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-gradient shadow-glow">
            <Trophy size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Leaderboard</h1>
            <p className="text-xs text-subtle">Biggest wins on Jacasino — can you crack the top 3?</p>
          </div>
        </div>

        <div className="flex rounded-xl border border-border bg-elevated p-1">
          {(['today', 'week'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
                period === p ? 'bg-brand text-white' : 'text-muted hover:text-white',
              )}
            >
              {p === 'today' ? 'Today' : 'This Week'}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[44px_1fr_auto_auto] gap-x-3 border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-subtle sm:grid-cols-[44px_1fr_100px_100px_110px]">
          <span>#</span>
          <span>Player</span>
          <span className="hidden text-right sm:block">Bet</span>
          <span className="text-right">Multiplier</span>
          <span className="text-right">Win</span>
        </div>

        {entries.map((e, i) => (
          <motion.div
            key={`${period}-${e.name}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.035, duration: 0.3 }}
            className={cn(
              'grid grid-cols-[44px_1fr_auto_auto] items-center gap-x-3 px-4 py-3 text-sm sm:grid-cols-[44px_1fr_100px_100px_110px]',
              e.isYou ? 'bg-brand/15 ring-1 ring-inset ring-brand/40' : 'odd:bg-elevated/40',
            )}
          >
            <span className={cn('font-mono text-sm font-bold tabular-nums', MEDALS[i] ?? 'text-subtle')}>
              {i < 3 ? <Crown size={16} className="inline -translate-y-px" /> : null} {i + 1}
            </span>
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                  e.isYou ? 'bg-brand text-white' : 'bg-brand/20 text-brand-light',
                )}
              >
                {e.name.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className={cn('truncate font-semibold', e.isYou ? 'text-white' : 'text-muted')}>{e.name}</p>
                <p className="truncate text-xs text-subtle">{e.game}</p>
              </div>
            </div>
            <span className="hidden text-right font-mono text-xs tabular-nums text-muted sm:block">
              {formatMoney(e.bet)}
            </span>
            <span className="text-right font-mono text-xs font-semibold text-brand-light">
              {formatMultiplier(e.multiplier)}
            </span>
            <span className="text-right font-mono text-sm font-bold tabular-nums text-win">
              +{formatMoney(e.win)}
            </span>
          </motion.div>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-subtle">
        Other players are simulated — this is a play-money demo. Your best win of the period is ranked for real.
      </p>
    </div>
  )
}
