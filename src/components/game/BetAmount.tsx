import { Coins } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'

interface BetAmountProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  label?: string
}

export function BetAmount({ value, onChange, disabled, label = 'Bet Amount' }: BetAmountProps) {
  const balance = useStore((s) => s.balance)
  const tooHigh = value > balance + 1e-9

  const set = (v: number) => {
    sfx.tick()
    onChange(round2(Math.max(0, v)))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <span className="text-xs text-subtle">
          Balance: <span className="text-muted font-medium">{balance.toFixed(2)}</span>
        </span>
      </div>
      <div className="flex items-stretch gap-1.5">
        <div
          className={cn(
            'flex flex-1 items-center gap-2 rounded-lg border bg-base px-3 transition-colors',
            tooHigh ? 'border-loss/60' : 'border-border focus-within:border-brand/60',
          )}
        >
          <Coins size={16} className="shrink-0 text-gold" />
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={Number.isFinite(value) ? value : ''}
            disabled={disabled}
            onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-full bg-transparent py-2.5 text-sm font-semibold text-white outline-none placeholder:text-subtle disabled:opacity-60"
            placeholder="0.00"
          />
        </div>
        <button
          disabled={disabled}
          onClick={() => set(value / 2)}
          className="btn-ghost rounded-lg px-3 text-xs"
          title="Halve"
        >
          ½
        </button>
        <button
          disabled={disabled}
          onClick={() => set(value * 2)}
          className="btn-ghost rounded-lg px-3 text-xs"
          title="Double"
        >
          2×
        </button>
        <button
          disabled={disabled}
          onClick={() => set(balance)}
          className="btn-ghost rounded-lg px-3 text-xs font-semibold"
          title="Max bet"
        >
          Max
        </button>
      </div>
      {tooHigh && <p className="text-xs text-loss">Insufficient balance.</p>}
    </div>
  )
}
