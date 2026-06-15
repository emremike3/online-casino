import { AnimatePresence, motion } from 'framer-motion'
import { formatMultiplier } from '@/lib/format'

interface WinBadgeProps {
  show: boolean
  multiplier: number
  payout?: number
}

/** A celebratory floating multiplier badge shown after a win. */
export function WinBadge({ show, multiplier, payout }: WinBadgeProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={`${multiplier}-${payout}`}
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, scale: 0.5, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        >
          <div className="flex flex-col items-center gap-1 rounded-2xl border-2 border-win/60 bg-base/85 px-7 py-4 shadow-glow-win backdrop-blur-md">
            <span className="text-3xl font-extrabold text-win">{formatMultiplier(multiplier)}</span>
            {payout !== undefined && (
              <span className="text-sm font-semibold text-win/90">+{payout.toFixed(2)}</span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
