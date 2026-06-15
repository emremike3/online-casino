import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  duration?: number
  decimals?: number
  className?: string
}

/** Smoothly tweens a displayed number toward `value`. */
export function AnimatedNumber({ value, duration = 500, decimals = 2, className }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number>()

  useEffect(() => {
    fromRef.current = display
    startRef.current = null
    const from = fromRef.current
    const delta = value - from

    if (Math.abs(delta) < 0.005) {
      setDisplay(value)
      return
    }

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + delta * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else setDisplay(value)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return (
    <span className={className}>
      {display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  )
}
