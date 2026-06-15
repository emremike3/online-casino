import { AnimatePresence, motion } from 'framer-motion'
import { X, Wallet, RotateCcw, Gift } from 'lucide-react'
import { useStore, STARTING_BALANCE } from '@/store/useStore'
import { Button } from '@/components/ui/Button'
import { sfx } from '@/lib/sound'

interface Props {
  open: boolean
  onClose: () => void
}

export function WalletModal({ open, onClose }: Props) {
  const balance = useStore((s) => s.balance)
  const resetBalance = useStore((s) => s.resetBalance)
  const claimFaucet = useStore((s) => s.claimFaucet)
  const canFaucet = useStore((s) => s.canFaucet())

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="card relative z-10 w-full max-w-sm p-6"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold/15 text-gold">
                  <Wallet size={18} />
                </div>
                <h2 className="text-lg font-bold">Wallet</h2>
              </div>
              <button onClick={onClose} className="text-subtle hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="mb-5 rounded-xl border border-border bg-base p-4 text-center">
              <span className="stat-label">Fun-Money Balance</span>
              <p className="mt-1 text-3xl font-extrabold text-gold">{balance.toFixed(2)}</p>
              <p className="mt-1 text-xs text-subtle">Play money only — never real currency.</p>
            </div>

            <div className="space-y-2">
              <Button
                variant="win"
                className="w-full"
                disabled={!canFaucet}
                onClick={() => {
                  if (claimFaucet()) sfx.coin()
                }}
              >
                <Gift size={16} /> {canFaucet ? 'Claim 1,000 Bonus' : 'Bonus available when low'}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  resetBalance()
                  sfx.coin()
                }}
              >
                <RotateCcw size={16} /> Reset to {STARTING_BALANCE.toLocaleString()}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
