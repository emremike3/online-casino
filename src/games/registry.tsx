import { lazy, type ComponentType } from 'react'

/**
 * Maps game id → its React component. Games are code-split so each route only
 * loads what it needs. New games just register here.
 */
export const GAME_COMPONENTS: Record<string, ComponentType> = {
  dice: lazy(() => import('./Dice').then((m) => ({ default: m.Dice }))),
  limbo: lazy(() => import('./Limbo').then((m) => ({ default: m.Limbo }))),
  crash: lazy(() => import('./Crash').then((m) => ({ default: m.Crash }))),
  mines: lazy(() => import('./Mines').then((m) => ({ default: m.Mines }))),
  plinko: lazy(() => import('./Plinko').then((m) => ({ default: m.Plinko }))),
  wheel: lazy(() => import('./Wheel').then((m) => ({ default: m.Wheel }))),
  keno: lazy(() => import('./Keno').then((m) => ({ default: m.Keno }))),
  hilo: lazy(() => import('./Hilo').then((m) => ({ default: m.Hilo }))),
  towers: lazy(() => import('./Towers').then((m) => ({ default: m.Towers }))),
  roulette: lazy(() => import('./Roulette').then((m) => ({ default: m.Roulette }))),
  blackjack: lazy(() => import('./Blackjack').then((m) => ({ default: m.Blackjack }))),
  slots: lazy(() => import('./Slots').then((m) => ({ default: m.Slots }))),
  coinflip: lazy(() => import('./Coinflip').then((m) => ({ default: m.Coinflip }))),
}
