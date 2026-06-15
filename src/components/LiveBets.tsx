import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Radio } from 'lucide-react'
import { GAMES } from '@/data/games'
import { formatMultiplier } from '@/lib/format'

interface LiveBet {
  id: number
  user: string
  game: string
  bet: number
  multiplier: number
  payout: number
  win: boolean
}

const NAMES = [
  'Nova', 'Pixel', 'Zephyr', 'Echo', 'Riff', 'Lunar', 'Vortex', 'Cipher', 'Quartz', 'Blaze',
  'Drift', 'Onyx', 'Spark', 'Glitch', 'Maple', 'Frost', 'Cobalt', 'Rogue', 'Aero', 'Jade',
  'Nimbus', 'Volt', 'Sable', 'Crimson', 'Halo', 'Specter', 'Lyric', 'Atlas', 'Koi', 'Wren',
]

function randomBet(id: number): LiveBet {
  const game = GAMES[Math.floor(Math.random() * GAMES.length)]
  const win = Math.random() > 0.52
  const bet = Math.round((Math.random() * 480 + 2) * 100) / 100
  // skewed multiplier distribution: usually small, occasionally big
  const roll = Math.random()
  let multiplier: number
  if (!win) multiplier = 0
  else if (roll > 0.985) multiplier = Math.round((Math.random() * 90 + 10) * 100) / 100
  else if (roll > 0.85) multiplier = Math.round((Math.random() * 6 + 2) * 100) / 100
  else multiplier = Math.round((Math.random() * 1.4 + 1.05) * 100) / 100

  const user = NAMES[Math.floor(Math.random() * NAMES.length)] + (Math.floor(Math.random() * 900) + 100)
  return { id, user, game: game.name, bet, multiplier, payout: Math.round(bet * multiplier * 100) / 100, win }
}

export function LiveBets() {
  const [bets, setBets] = useState<LiveBet[]>(() =>
    Array.from({ length: 8 }, (_, i) => randomBet(i)),
  )

  useEffect(() => {
    let id = 1000
    const tick = () => {
      setBets((prev) => [randomBet(id++), ...prev].slice(0, 9))
    }
    const interval = setInterval(tick, 1600 + Math.random() * 1200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-win" />
        </span>
        <Radio size={15} className="text-win" />
        <h3 className="text-sm font-bold">Live Bets</h3>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        <span>Player</span>
        <span className="text-right">Multiplier</span>
        <span className="text-right">Payout</span>
      </div>

      <div className="relative max-h-[360px] overflow-hidden px-2 pb-2">
        <AnimatePresence initial={false}>
          {bets.map((b) => (
            <motion.div
              key={b.id}
              layout
              initial={{ opacity: 0, y: -12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 rounded-lg px-2 py-2 text-sm odd:bg-elevated/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/20 text-[10px] font-bold text-brand-light">
                  {b.user.slice(0, 1)}
                </span>
                <span className="truncate font-medium text-muted">{b.user}</span>
                <span className="hidden truncate text-xs text-subtle sm:inline">· {b.game}</span>
              </div>
              <span
                className={`text-right font-mono text-xs font-semibold ${
                  b.win ? 'text-win' : 'text-subtle'
                }`}
              >
                {b.win ? formatMultiplier(b.multiplier) : '—'}
              </span>
              <span
                className={`text-right font-mono text-xs font-semibold tabular-nums ${
                  b.win ? 'text-win' : 'text-loss'
                }`}
              >
                {b.win ? `+${b.payout.toFixed(2)}` : `-${b.bet.toFixed(2)}`}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
