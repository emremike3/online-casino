/** Formatting helpers for the fun-money currency. */

const fmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const fmtCompact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

/** 1234.5 → "1,234.50" */
export function formatMoney(amount: number): string {
  return fmt.format(amount)
}

/** Adds the coin glyph. */
export function formatCoins(amount: number): string {
  return `${fmt.format(amount)}`
}

/** 1234567 → "1.23M" for tight spaces. */
export function formatCompact(amount: number): string {
  return fmtCompact.format(amount)
}

/** 2.5 → "2.50×" */
export function formatMultiplier(mult: number): string {
  const digits = mult >= 100 ? 1 : 2
  return `${mult.toFixed(digits)}×`
}

/** Clamp a number into a range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Round to 2 decimals safely. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
