import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface StatProps {
  label: string
  children: ReactNode
  className?: string
}

/** A compact label/value row used inside game control panels. */
export function Stat({ label, children, className }: StatProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <span className="stat-label">{label}</span>
      <div className="flex items-center rounded-lg border border-border bg-base px-3 py-2.5 text-sm font-semibold">
        {children}
      </div>
    </div>
  )
}
