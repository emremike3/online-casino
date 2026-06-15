import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import type { GameMeta } from '@/data/games'
import { cn } from '@/lib/cn'

interface GameCardProps {
  game: GameMeta
  index?: number
}

export function GameCard({ game, index = 0 }: GameCardProps) {
  const { Icon } = game
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.35 }}
    >
      <Link
        to={`/game/${game.id}`}
        className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-surface"
      >
        {/* Gradient artwork */}
        <div className={cn('absolute inset-0 bg-gradient-to-br opacity-90', game.gradient)} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Decorative oversized icon */}
        <Icon
          className="absolute -right-5 -top-4 h-28 w-28 text-white/15 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6"
          strokeWidth={1.5}
        />

        {/* Foreground */}
        <div className="absolute inset-0 flex flex-col justify-end p-4">
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
            <Icon size={20} className="text-white" />
          </div>
          <h3 className="text-base font-bold leading-tight text-white">{game.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-white/70">{game.tagline}</p>
        </div>

        {/* Hover play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black shadow-lg">
            <Play size={16} className="fill-black" /> Play
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
