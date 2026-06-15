import { lazy, type ComponentType } from 'react'

/**
 * Maps game id → its React component. Games are code-split so each route only
 * loads what it needs. New games just register here.
 */
export const GAME_COMPONENTS: Record<string, ComponentType> = {
  dice: lazy(() => import('./Dice').then((m) => ({ default: m.Dice }))),
  // NOTE: remaining games are wired in once their files exist.
}
