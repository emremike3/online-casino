import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import type { GameMeta } from '@/data/games'
import { ProvablyFairModal } from './ProvablyFairModal'

interface GameLayoutProps {
  game: GameMeta
  /** Left-hand betting controls. */
  controls: ReactNode
  /** Main play area. */
  children: ReactNode
}

export function GameLayout({ game, controls, children }: GameLayoutProps) {
  const [fairOpen, setFairOpen] = useState(false)
  const { Icon } = game

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-elevated text-muted transition-colors hover:text-white"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div
              className="grid h-10 w-10 place-items-center rounded-xl text-white"
              style={{ background: game.accent }}
            >
              <Icon size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-none">{game.name}</h1>
              <p className="mt-1 text-xs text-subtle">{game.tagline}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setFairOpen(true)}
          className="chip border border-border bg-elevated text-muted transition-colors hover:text-win"
        >
          <ShieldCheck size={14} className="text-win" />
          <span className="hidden sm:inline">Provably Fair</span>
        </button>
      </div>

      {/* Body: controls left, canvas right (canvas-first on mobile) */}
      <div className="card flex flex-col-reverse overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 border-border bg-elevated/40 p-4 lg:w-[340px] lg:border-r">
          {controls}
        </aside>
        <main className="relative flex min-h-[360px] flex-1 items-center justify-center overflow-hidden p-4 sm:min-h-[480px] sm:p-6">
          {children}
        </main>
      </div>

      <ProvablyFairModal open={fairOpen} onClose={() => setFairOpen(false)} />
    </div>
  )
}
