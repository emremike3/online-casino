# 🎰 Lucky — Fun-Money Online Casino

A sleek, modern, **play-money** online casino built with React + TypeScript.
Clean dark UI and smooth animations inspired by crypto casinos like duel.com —
with **13 provably-fair games**. No real money, deposits, withdrawals or prizes.
Purely for entertainment. 18+.

> ⚠️ This is a toy project. The "currency" is fake and lives only in your
> browser's `localStorage`. Nothing here involves real gambling.

## ✨ Features

- **13 games** across two categories:
  - **Originals:** Dice, Limbo, Crash, Mines, Plinko, Wheel, Keno, Hi-Lo, Towers
  - **Classics:** Roulette, Blackjack, Slots, Coinflip
- **Provably fair** — every outcome is derived from
  `HMAC_SHA256(serverSeed, clientSeed:nonce)` using a self-contained, verifiable
  SHA-256 implementation (validated against the standard NIST test vectors). The
  server-seed hash is shown *before* you bet; rotate the seed any time to reveal
  it and re-check past rounds.
- **Real randomness** seeded from `crypto.getRandomValues` — a 1% house edge is
  applied just like a real casino, so results are genuinely random and fair.
- **Clean, animated UI** — Tailwind CSS design system, Framer Motion animations,
  synthesized Web-Audio sound effects (no asset files), responsive from mobile to
  desktop.
- **Persistent wallet** — balance, stats, bet history and your fairness seeds are
  saved locally. Top up or reset any time from the Wallet.
- **Live bets ticker**, recent-results history, win/loss stats, and a polished
  lobby.

## 🚀 Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build
npm run preview  # preview the production build
```

## 🧱 Tech stack

| Concern        | Choice                          |
| -------------- | ------------------------------- |
| Framework      | React 18 + TypeScript (strict)  |
| Build tool     | Vite 5                          |
| Styling        | Tailwind CSS 3                  |
| Animation      | Framer Motion                   |
| State          | Zustand (with `persist`)        |
| Routing        | React Router 6                  |
| Icons          | lucide-react                    |
| Randomness     | Custom synchronous HMAC-SHA256  |

## 📁 Project structure

```
src/
├── components/        # layout (sidebar/topbar/wallet), shared game UI, cards
├── data/games.ts      # the game registry (metadata + grouping)
├── games/             # one file per game + registry.tsx (code-split routes)
├── lib/               # rng (provably fair), format, sound, cn
├── pages/             # Home (lobby) + GamePage (loads a game by id)
├── store/useStore.ts  # balance, fairness, history, stats
└── index.css          # Tailwind layers + design tokens
```

## 🔐 How provably fair works

1. A random `serverSeed` is generated; its SHA-256 hash is shown to you up front.
2. You provide (or get a random) `clientSeed`. A `nonce` counts each bet.
3. Each bet's randomness is `HMAC_SHA256(serverSeed, "clientSeed:nonce:round")`,
   sliced into uniform floats in `[0, 1)`.
4. Rotate the server seed to reveal it — now you can recompute any past result
   and confirm nothing was tampered with.

See `src/lib/rng.ts` and `docs/GAME_CONTRACT.md` for details.

## 📜 Disclaimer

For entertainment only. Lucky uses **virtual fun-money with no monetary value**
and offers no way to deposit, withdraw or win real money or prizes. It is not
gambling. If real gambling is affecting you, seek help (e.g. begambleaware.org).
