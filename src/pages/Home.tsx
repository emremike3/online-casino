import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, Gem, ShieldCheck, Zap, Dices } from 'lucide-react'
import { GAMES } from '@/data/games'
import { GameCard } from '@/components/GameCard'
import { LiveBets } from '@/components/LiveBets'
import { useStore } from '@/store/useStore'

export function Home() {
  const originals = GAMES.filter((g) => g.category === 'Originals')
  const classics = GAMES.filter((g) => g.category === 'Classics')
  const stats = useStore((s) => s.stats)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-8 overflow-hidden rounded-3xl border border-border bg-surface p-8 sm:p-12"
      >
        <div className="absolute inset-0 bg-radial-fade" />
        <div
          className="absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #7c5cff, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-24 right-1/3 h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #4f8cff, transparent 70%)' }}
        />

        <div className="relative max-w-2xl">
          <span className="chip mb-4 border border-win/30 bg-win/10 text-win">
            <ShieldCheck size={14} /> 100% Provably Fair
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            Play the thrill.
            <br />
            <span className="text-gradient">Risk none of it.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
            A sleek casino experience with {GAMES.length} games — Dice, Crash, Mines, Plinko and more.
            Every round is cryptographically random and verifiable. Pure fun-money, zero risk.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/game/dice" className="btn-primary px-6 py-3 text-sm">
              <Dices size={18} /> Start Playing
            </Link>
            <Link to="/game/crash" className="btn-ghost px-6 py-3 text-sm">
              <Zap size={18} /> Try Crash
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-6">
            <HeroStat label="Games" value={GAMES.length.toString()} />
            <HeroStat label="Your Bets" value={stats.bets.toLocaleString()} />
            <HeroStat label="Best Multiplier" value={stats.biggestMultiplier > 0 ? `${stats.biggestMultiplier.toFixed(2)}×` : '—'} />
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <GameSection title="Originals" icon={<Sparkles size={18} className="text-brand-light" />} games={originals} />
          <GameSection title="Classics" icon={<Gem size={18} className="text-gold" />} games={classics} />
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <LiveBets />
        </div>
      </div>

      <footer className="mt-12 border-t border-border pt-6 text-center">
        <p className="text-xs text-subtle">
          Jacasino is a play-money casino for entertainment only. No real money, deposits, withdrawals or
          prizes are involved. 18+.
        </p>
      </footer>
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  )
}

function GameSection({
  title,
  icon,
  games,
}: {
  title: string
  icon: React.ReactNode
  games: typeof GAMES
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="ml-1 rounded-full bg-elevated px-2 py-0.5 text-xs font-semibold text-subtle">
          {games.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {games.map((g, i) => (
          <GameCard key={g.id} game={g} index={i} />
        ))}
      </div>
    </section>
  )
}
