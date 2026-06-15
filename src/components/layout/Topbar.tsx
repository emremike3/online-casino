import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Coins, Wallet, Volume2, VolumeX, Menu, Plus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { WalletModal } from './WalletModal'
import { isMuted, setMuted, sfx } from '@/lib/sound'

interface TopbarProps {
  onMenu: () => void
}

export function Topbar({ onMenu }: TopbarProps) {
  const balance = useStore((s) => s.balance)
  const [walletOpen, setWalletOpen] = useState(false)
  const [muted, setMutedState] = useState(isMuted())

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
    if (!next) sfx.click()
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-base/80 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            onClick={onMenu}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-elevated text-muted lg:hidden"
          >
            <Menu size={18} />
          </button>

          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <LogoMark />
            <span className="text-lg font-extrabold tracking-tight">Lucky</span>
          </Link>

          <div className="flex-1" />

          {/* Balance pill */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-elevated py-1.5 pl-3 pr-1.5">
            <Coins size={16} className="text-gold" />
            <AnimatedNumber value={balance} className="min-w-[72px] text-right font-mono text-sm font-bold tabular-nums" />
            <button
              onClick={() => setWalletOpen(true)}
              className="grid h-7 w-7 place-items-center rounded-lg bg-brand-gradient text-white transition-transform active:scale-95"
              title="Wallet"
            >
              <Plus size={16} />
            </button>
          </div>

          <button
            onClick={() => setWalletOpen(true)}
            className="hidden h-9 w-9 place-items-center rounded-lg border border-border bg-elevated text-muted transition-colors hover:text-white sm:grid"
            title="Wallet"
          >
            <Wallet size={16} />
          </button>

          <button
            onClick={toggleMute}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-elevated text-muted transition-colors hover:text-white"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </header>

      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </>
  )
}

export function LogoMark() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gradient shadow-glow">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
        <path d="M12 3c-.8 3.2-2.4 4.8-5.6 5.6 3.2.8 4.8 2.4 5.6 5.6.8-3.2 2.4-4.8 5.6-5.6-3.2-.8-4.8-2.4-5.6-5.6z" />
        <circle cx="17.5" cy="6.5" r="1.3" />
      </svg>
    </div>
  )
}
