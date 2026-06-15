import {
  Dices,
  Rocket,
  Bomb,
  CircleDot,
  TrendingUp,
  Disc3,
  Grid3x3,
  ArrowUpDown,
  Building2,
  Target,
  Spade,
  Cherry,
  Coins,
  type LucideIcon,
} from 'lucide-react'

export type GameCategory = 'Originals' | 'Classics'

export interface GameMeta {
  id: string
  name: string
  tagline: string
  category: GameCategory
  /** Tailwind gradient utility classes used for the card artwork. */
  gradient: string
  /** Hex accent used for glows / highlights. */
  accent: string
  Icon: LucideIcon
}

export const GAMES: GameMeta[] = [
  {
    id: 'dice',
    name: 'Dice',
    tagline: 'Roll over or under your target',
    category: 'Originals',
    gradient: 'from-violet-500 to-indigo-600',
    accent: '#7c5cff',
    Icon: Dices,
  },
  {
    id: 'limbo',
    name: 'Limbo',
    tagline: 'How high can the multiplier go?',
    category: 'Originals',
    gradient: 'from-cyan-400 to-blue-600',
    accent: '#22d3ee',
    Icon: TrendingUp,
  },
  {
    id: 'crash',
    name: 'Crash',
    tagline: 'Cash out before the rocket crashes',
    category: 'Originals',
    gradient: 'from-orange-500 to-red-600',
    accent: '#ff5c39',
    Icon: Rocket,
  },
  {
    id: 'mines',
    name: 'Mines',
    tagline: 'Find the gems, dodge the bombs',
    category: 'Originals',
    gradient: 'from-emerald-400 to-teal-600',
    accent: '#10d9a0',
    Icon: Bomb,
  },
  {
    id: 'plinko',
    name: 'Plinko',
    tagline: 'Drop the ball, chase the edges',
    category: 'Originals',
    gradient: 'from-pink-500 to-fuchsia-600',
    accent: '#ec4899',
    Icon: CircleDot,
  },
  {
    id: 'wheel',
    name: 'Wheel',
    tagline: 'Spin for a random multiplier',
    category: 'Originals',
    gradient: 'from-amber-400 to-orange-600',
    accent: '#ffc93c',
    Icon: Disc3,
  },
  {
    id: 'keno',
    name: 'Keno',
    tagline: 'Pick your lucky numbers',
    category: 'Originals',
    gradient: 'from-indigo-400 to-purple-600',
    accent: '#8b7cff',
    Icon: Grid3x3,
  },
  {
    id: 'hilo',
    name: 'Hi-Lo',
    tagline: 'Guess higher or lower',
    category: 'Originals',
    gradient: 'from-lime-400 to-green-600',
    accent: '#84cc16',
    Icon: ArrowUpDown,
  },
  {
    id: 'towers',
    name: 'Towers',
    tagline: 'Climb without hitting a trap',
    category: 'Originals',
    gradient: 'from-sky-400 to-indigo-600',
    accent: '#38bdf8',
    Icon: Building2,
  },
  {
    id: 'roulette',
    name: 'Roulette',
    tagline: 'The timeless wheel of fortune',
    category: 'Classics',
    gradient: 'from-red-500 to-rose-700',
    accent: '#ef4444',
    Icon: Target,
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    tagline: 'Beat the dealer to 21',
    category: 'Classics',
    gradient: 'from-green-500 to-emerald-700',
    accent: '#22c55e',
    Icon: Spade,
  },
  {
    id: 'slots',
    name: 'Slots',
    tagline: 'Spin the reels for a jackpot',
    category: 'Classics',
    gradient: 'from-fuchsia-500 to-pink-600',
    accent: '#d946ef',
    Icon: Cherry,
  },
  {
    id: 'coinflip',
    name: 'Coinflip',
    tagline: 'Heads or tails, double or nothing',
    category: 'Classics',
    gradient: 'from-yellow-400 to-amber-600',
    accent: '#facc15',
    Icon: Coins,
  },
]

export const GAMES_BY_ID: Record<string, GameMeta> = Object.fromEntries(
  GAMES.map((g) => [g.id, g]),
)

export function getGame(id: string | undefined): GameMeta | undefined {
  return id ? GAMES_BY_ID[id] : undefined
}
