import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { randomServerSeed, randomClientSeed, randomFloats, sha256 } from '@/lib/rng'
import { round2 } from '@/lib/format'

export const STARTING_BALANCE = 10000
const FAUCET_AMOUNT = 1000
const FAUCET_THRESHOLD = 10 // can claim when balance below this
const HISTORY_LIMIT = 50

export interface BetRecord {
  id: string
  game: string
  gameLabel: string
  betAmount: number
  multiplier: number
  payout: number
  profit: number
  win: boolean
  time: number
}

export interface Fairness {
  serverSeed: string
  serverSeedHashed: string
  clientSeed: string
  nonce: number
  previousServerSeed: string | null
  previousServerSeedHashed: string | null
}

export interface Stats {
  totalWagered: number
  totalProfit: number
  bets: number
  wins: number
  losses: number
  biggestWin: number
  biggestMultiplier: number
}

interface CasinoState {
  balance: number
  fairness: Fairness
  history: BetRecord[]
  stats: Stats

  // money
  bet: (amount: number) => boolean
  credit: (amount: number) => void
  resetBalance: () => void
  claimFaucet: () => boolean
  canFaucet: () => boolean

  // provably fair
  consumeNonce: () => { serverSeed: string; clientSeed: string; nonce: number }
  drawFloats: (count: number) => { floats: number[]; nonce: number; serverSeed: string; clientSeed: string }
  setClientSeed: (seed: string) => void
  rotateServerSeed: () => void

  // record outcome (does not touch balance — call bet()/credit() for that)
  recordBet: (entry: {
    game: string
    gameLabel: string
    betAmount: number
    multiplier: number
    payout: number
  }) => void
}

function freshFairness(): Fairness {
  const serverSeed = randomServerSeed()
  return {
    serverSeed,
    serverSeedHashed: sha256(serverSeed),
    clientSeed: randomClientSeed(),
    nonce: 0,
    previousServerSeed: null,
    previousServerSeedHashed: null,
  }
}

const initialStats: Stats = {
  totalWagered: 0,
  totalProfit: 0,
  bets: 0,
  wins: 0,
  losses: 0,
  biggestWin: 0,
  biggestMultiplier: 0,
}

export const useStore = create<CasinoState>()(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      fairness: freshFairness(),
      history: [],
      stats: initialStats,

      bet: (amount) => {
        const { balance } = get()
        if (amount <= 0 || amount > balance + 1e-9) return false
        set({ balance: round2(balance - amount) })
        return true
      },

      credit: (amount) => {
        if (amount <= 0) return
        set((s) => ({ balance: round2(s.balance + amount) }))
      },

      resetBalance: () => set({ balance: STARTING_BALANCE }),

      canFaucet: () => get().balance < FAUCET_THRESHOLD,

      claimFaucet: () => {
        if (get().balance >= FAUCET_THRESHOLD) return false
        set((s) => ({ balance: round2(s.balance + FAUCET_AMOUNT) }))
        return true
      },

      consumeNonce: () => {
        const { fairness } = get()
        const snapshot = {
          serverSeed: fairness.serverSeed,
          clientSeed: fairness.clientSeed,
          nonce: fairness.nonce,
        }
        set({ fairness: { ...fairness, nonce: fairness.nonce + 1 } })
        return snapshot
      },

      drawFloats: (count) => {
        const { serverSeed, clientSeed, nonce } = get().consumeNonce()
        return { floats: randomFloats(serverSeed, clientSeed, nonce, count), nonce, serverSeed, clientSeed }
      },

      setClientSeed: (seed) => {
        const clean = seed.trim().slice(0, 64) || randomClientSeed()
        set((s) => ({ fairness: { ...s.fairness, clientSeed: clean, nonce: 0 } }))
      },

      rotateServerSeed: () => {
        const { fairness } = get()
        const serverSeed = randomServerSeed()
        set({
          fairness: {
            serverSeed,
            serverSeedHashed: sha256(serverSeed),
            clientSeed: fairness.clientSeed,
            nonce: 0,
            previousServerSeed: fairness.serverSeed,
            previousServerSeedHashed: fairness.serverSeedHashed,
          },
        })
      },

      recordBet: ({ game, gameLabel, betAmount, multiplier, payout }) => {
        const profit = round2(payout - betAmount)
        const win = profit > 0
        const record: BetRecord = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          game,
          gameLabel,
          betAmount: round2(betAmount),
          multiplier: round2(multiplier),
          payout: round2(payout),
          profit,
          win,
          time: Date.now(),
        }
        set((s) => ({
          history: [record, ...s.history].slice(0, HISTORY_LIMIT),
          stats: {
            totalWagered: round2(s.stats.totalWagered + betAmount),
            totalProfit: round2(s.stats.totalProfit + profit),
            bets: s.stats.bets + 1,
            wins: s.stats.wins + (win ? 1 : 0),
            losses: s.stats.losses + (win ? 0 : 1),
            biggestWin: Math.max(s.stats.biggestWin, profit),
            biggestMultiplier: Math.max(s.stats.biggestMultiplier, win ? multiplier : 0),
          },
        }))
      },
    }),
    {
      name: 'lucky-casino',
      version: 1,
      partialize: (s) => ({
        balance: s.balance,
        fairness: s.fairness,
        history: s.history,
        stats: s.stats,
      }),
    },
  ),
)
