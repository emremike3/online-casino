import { NavLink, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Home, Sparkles, Gem, Trophy, X } from 'lucide-react'
import { GAMES } from '@/data/games'
import { cn } from '@/lib/cn'
import { LogoMark } from './Topbar'

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const originals = GAMES.filter((g) => g.category === 'Originals')
  const classics = GAMES.filter((g) => g.category === 'Classics')

  return (
    <div className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 py-5">
        <LogoMark />
        <div>
          <span className="text-xl font-extrabold tracking-tight">Jacasino</span>
          <p className="-mt-0.5 text-[10px] font-medium uppercase tracking-widest text-subtle">
            Fun-Money Casino
          </p>
        </div>
      </Link>

      <nav className="scroll-hidden flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        <div>
          <NavLink
            to="/"
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-brand/15 text-white' : 'text-muted hover:bg-hover hover:text-white',
              )
            }
          >
            <Home size={18} /> Home
          </NavLink>
          <NavLink
            to="/leaderboard"
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-brand/15 text-white' : 'text-muted hover:bg-hover hover:text-white',
              )
            }
          >
            <Trophy size={18} /> Leaderboard
          </NavLink>
        </div>

        <NavGroup label="Originals" icon={<Sparkles size={13} />} games={originals} onNavigate={onNavigate} />
        <NavGroup label="Classics" icon={<Gem size={13} />} games={classics} onNavigate={onNavigate} />
      </nav>

      <div className="border-t border-border px-5 py-4">
        <p className="text-[10px] leading-relaxed text-subtle">
          18+ · Play money only. No real currency, deposits or prizes. For entertainment.
        </p>
      </div>
    </div>
  )
}

function NavGroup({
  label,
  icon,
  games,
  onNavigate,
}: {
  label: string
  icon: React.ReactNode
  games: typeof GAMES
  onNavigate?: () => void
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-subtle">
        {icon} {label}
      </div>
      <div className="space-y-0.5">
        {games.map((g) => {
          const { Icon } = g
          return (
            <NavLink
              key={g.id}
              to={`/game/${g.id}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-hover text-white' : 'text-muted hover:bg-hover hover:text-white',
                )
              }
            >
              <span
                className="grid h-6 w-6 place-items-center rounded-md text-white transition-transform group-hover:scale-110"
                style={{ background: g.accent }}
              >
                <Icon size={13} />
              </span>
              {g.name}
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] border-r border-border bg-surface/60 backdrop-blur-xl lg:block">
        <NavContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[270px] border-r border-border bg-surface lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <button
                onClick={onClose}
                className="absolute right-3 top-4 z-10 grid h-8 w-8 place-items-center rounded-lg text-subtle hover:text-white"
              >
                <X size={18} />
              </button>
              <NavContent onNavigate={onClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
