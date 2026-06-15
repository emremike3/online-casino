# Game Implementation Contract

Every game lives in `src/games/<Name>.tsx` and exports a named React component
(e.g. `export function Crash() {}`). Follow `src/games/Dice.tsx` as the canonical
reference for structure, styling and the betting flow.

## Hard rules (TypeScript is strict)

- `noUnusedLocals` + `noUnusedParameters` are ON → **no unused imports or variables**.
- JSX runtime is `react-jsx` → do **not** `import React`. Import hooks directly:
  `import { useState, useEffect, useRef } from 'react'`.
- Use the `@/` alias for all internal imports (e.g. `@/store/useStore`).
- Only create your single game file. Do **not** edit shared files, run `git`,
  `npm install`, or `npm run build`. The orchestrator handles integration.
- Keep everything self-contained in your file (local sub-components, tables, etc.).

## Store API — `@/store/useStore`

```ts
const balance    = useStore((s) => s.balance)                 // number
const bet        = useStore((s) => s.bet)                     // (amount) => boolean  — deducts stake; false if insufficient
const credit     = useStore((s) => s.credit)                  // (amount) => void     — adds winnings (total returned incl. stake)
const drawFloats = useStore((s) => s.drawFloats)              // (count) => { floats: number[]; nonce; serverSeed; clientSeed }
const recordBet  = useStore((s) => s.recordBet)               // (entry) => void
```

`drawFloats(n)` consumes ONE provably-fair nonce and returns `n` independent
floats in `[0, 1)`. Call it **once per bet** (one nonce = one bet), even for
multi-step games (draw all randomness you need up front).

`recordBet` signature:
```ts
recordBet({
  game: '<id>',          // matches the id in src/data/games.ts
  gameLabel: '<Name>',
  betAmount: number,
  multiplier: number,    // 0 on a loss; the win multiplier on a win
  payout: number,        // total returned to player (0 on loss). profit = payout - betAmount
})
```

## Betting flow (instant games)

```ts
function play() {
  if (busy) return
  if (!bet(amount)) return            // insufficient balance — abort, do not draw
  const { floats } = drawFloats(N)    // N = how many random numbers this bet needs
  // ...derive outcome from floats...
  const payout = win ? round2(amount * multiplier) : 0
  if (payout > 0) credit(payout)
  recordBet({ game: '<id>', gameLabel: '<Name>', betAmount: amount,
              multiplier: win ? multiplier : 0, payout })
}
```

For interactive games (Mines, Crash, Hi-Lo, Towers, Blackjack): call `bet(amount)`
when the round STARTS (this both checks affordability and deducts the stake) and
draw all randomness then. Call `credit(...)` only on cashout/win. Always call
`recordBet(...)` exactly once when the round ends (win or loss).

## RNG helpers — `@/lib/rng`

```ts
floatToInt(float, min, max)                       // integer in [min, max] inclusive
shuffledIndices(serverSeed, clientSeed, nonce, n) // provably-fair Fisher–Yates of [0..n-1]
randomFloats(serverSeed, clientSeed, nonce, n)    // raw floats (drawFloats wraps this)
```

For card/deck games use the `serverSeed/clientSeed/nonce` returned by `drawFloats`
together with `shuffledIndices` to get a verifiable shuffle.

## House edge

Apply a **1% house edge**: `multiplier = fairMultiplier * 0.99` (round with
`round2`). Where a game has an inherent edge (Roulette zero), keep true odds.

## Format helpers — `@/lib/format`

`formatMoney(n)`, `formatMultiplier(m)` → `"2.50×"`, `round2(n)`, `clamp(v,min,max)`.

## Sound — `@/lib/sound`

`import { sfx } from '@/lib/sound'` then call e.g. `sfx.bet()`, `sfx.win()`,
`sfx.bigWin()`, `sfx.lose()`, `sfx.cashout()`, `sfx.explode()`, `sfx.reveal()`,
`sfx.spin()`, `sfx.card()`, `sfx.coin()`, `sfx.tick()`, `sfx.click()`.

## Shared UI components

- `GameLayout` — `@/components/game/GameLayout`
  ```tsx
  <GameLayout game={meta} controls={controlsJSX}>{boardJSX}</GameLayout>
  ```
  `meta = GAMES_BY_ID['<id>']` from `@/data/games`. `controls` is the left panel
  (bet amount, options, action button). Children are the main play canvas.
- `BetAmount` — `@/components/game/BetAmount`
  `<BetAmount value={amount} onChange={setAmount} disabled={busy} />`
- `Button` — `@/components/ui/Button`
  `<Button variant="primary|win|ghost|danger" size="sm|md|lg" onClick={...}>…</Button>`
- `Stat` — `@/components/game/Stat` — `<Stat label="…">value</Stat>`
- `WinBadge` — `@/components/game/WinBadge` — `<WinBadge show={…} multiplier={…} payout={…} />`

## Design language

- Dark, clean, modern (Stake/duel inspired). Use Tailwind classes already in the
  project: `card`, `panel`, `btn-primary`, `btn-ghost`, `btn-win`, `chip`,
  `stat-label`, `text-gradient`, colors `brand`, `accent`, `win`, `loss`, `gold`,
  `muted`, `subtle`, surfaces `base`, `surface`, `elevated`, `hover`, `border`.
- Use `framer-motion` for smooth, tasteful animations (it's installed).
- Use `lucide-react` for icons.
- Keep the canvas responsive; it must look good from ~360px wide up to desktop.
- Show a small recent-results history where it fits, like Dice does.

## Component shape

```tsx
import { useState } from 'react'
import { GAMES_BY_ID } from '@/data/games'
import { GameLayout } from '@/components/game/GameLayout'
import { BetAmount } from '@/components/game/BetAmount'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { round2 } from '@/lib/format'
import { sfx } from '@/lib/sound'

const meta = GAMES_BY_ID['<id>']

export function <Name>() {
  // state, store actions, play() ...
  const controls = (<div className="space-y-4"> … </div>)
  return <GameLayout game={meta} controls={controls}> … board … </GameLayout>
}
```
