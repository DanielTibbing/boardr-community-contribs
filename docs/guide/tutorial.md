# Tutorial: build Tap Race

Tap Race is the game `boardr create` scaffolds: everyone mashes a button on their phone, first to the target wins. It's deliberately tiny — but it exercises the whole pipeline: shared state, an `alwaysAllowed` move, seeded randomness, a board UI, a phone UI, and tests. This page builds it from an empty folder so you see what every piece is for.

If you'd rather start from the finished thing: `npx boardr create tap-race` and read along.

## 1. The folder

```
tap-race/
  boardr.game.json   ← manifest: identity + entry points
  package.json
  src/
    logic.ts         ← the game (runs on the table, sandboxed)
    board.tsx        ← shared screen (optional)
    phone.tsx        ← per-player controller (optional)
    logic.test.ts
  icon.svg           ← library tile
  rules.md           ← the rulebook players open mid-game
```

## 2. The manifest

`boardr.game.json` tells the table what this is and where the built entry points live:

```json
{
  "manifestVersion": 1,
  "id": "com.example.tap-race",
  "name": "Tap Race",
  "version": "0.1.0",
  "minPlayers": 1,
  "maxPlayers": 4,
  "phoneMode": "optional",
  "sdkVersion": "^0.1.0",
  "entries": {
    "logic": "dist/logic.js",
    "boardUi": "dist/board.js",
    "phoneUi": "dist/phone.js"
  },
  "description": "Race your friends — first player to reach the tap target wins.",
  "tags": ["quick", "party"],
  "icon": "icon.svg",
  "rules": "rules.md"
}
```

`phoneMode: "optional"` means the game is playable hotseat on the table alone, *and* from phones. See the [manifest reference](/reference/manifest) for every field.

## 3. The logic

```ts
// src/logic.ts
import { defineGame, type GameState, type PlayerID } from '@boardr/sdk'

export interface TapRacePublic {
  taps: Record<PlayerID, number>
  target: number
}

export type TapRaceState = GameState<TapRacePublic>

export default defineGame<TapRaceState>({
  name: 'tap-race',
  minPlayers: 1,
  maxPlayers: 4,

  setup: (ctx) => ({
    public: {
      taps: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
      // seeded: same seed + same players = same target, always
      target: 10 + ctx.random.die(10),
    },
    secret: {},
  }),

  moves: {
    tap: {
      // a race has no turns — everyone may act at any time
      alwaysAllowed: true,
      move: (state, ctx) => {
        state.public.taps[ctx.playerID] = (state.public.taps[ctx.playerID] ?? 0) + 1
      },
    },
  },

  endIf: (state) => {
    const { taps, target } = state.public
    const winner = Object.keys(taps).find((pid) => (taps[pid] ?? 0) >= target)
    if (!winner) return undefined
    return { winner, scores: { ...taps } }
  },
})
```

Three things to notice:

1. **Everything is `public`** — there's nothing to hide in a race. A card game would put hands in `secret` and the deck in `internal`, and the engine would do the filtering.
2. **`alwaysAllowed: true`** opts this move out of turn order. Without it, the engine rejects moves from anyone but `currentPlayer`.
3. **The target comes from `ctx.random`** — never `Math.random()`, which throws in the sandbox. Determinism is what makes replay and hot-reload possible.

## 4. The tests

Write these *before* the UIs — the testkit runs the real engine, so passing tests mean the game actually works:

```ts
// src/logic.test.ts
import { createTestMatch } from '@boardr/testkit'
import { describe, expect, it } from 'vitest'
import game, { type TapRaceState } from './logic'

describe('tap race', () => {
  it('lets any player tap at any time', () => {
    const h = createTestMatch(game, { numPlayers: 2, seed: 'race' })
    h.moves['tap']!(undefined, { as: 'p0' })
    h.moves['tap']!(undefined, { as: 'p1' })
    h.moves['tap']!(undefined, { as: 'p1' })
    const pub = (h.getState() as { public: { taps: Record<string, number> } }).public
    expect(pub.taps).toEqual({ p0: 1, p1: 2 })
  })

  it('ends when someone reaches the target', () => {
    const h = createTestMatch(game, { numPlayers: 2, seed: 'finish' })
    const target = (h.getState() as { public: { target: number } }).public.target
    for (let i = 0; i < target; i++) h.moves['tap']!(undefined, { as: 'p1' })
    expect(h.match.gameover).toMatchObject({ winner: 'p1' })
  })
})
```

`npm test` — green. Now the pixels.

## 5. The board UI

The shared screen shows everyone's progress. It receives the board view (`{ public }`), match `meta`, and `dispatch`:

```tsx
// src/board.tsx
import type { BoardUiProps } from '@boardr/sdk'
import type { TapRacePublic } from './logic'

type BoardView = { public: TapRacePublic }

export default function Board({ view, meta }: BoardUiProps<BoardView>) {
  const { taps, target } = view.public
  const { players, gameover } = meta

  if (gameover) {
    const names = players.filter((p) => p.id === gameover.winner).map((p) => p.name)
    return <h1 style={{ textAlign: 'center', padding: '4rem' }}>🏆 {names.join(' & ')} wins!</h1>
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>First to {target} taps</h1>
      {players.map((p) => (
        <div key={p.id} style={{ display: 'flex', gap: '1rem', margin: '0.75rem 0' }}>
          <span style={{ width: '10rem' }}>{p.name}</span>
          <progress max={target} value={taps[p.id] ?? 0} style={{ flex: 1 }} />
          <span>{taps[p.id] ?? 0}/{target}</span>
        </div>
      ))}
    </div>
  )
}
```

## 6. The phone UI

One big button. `dispatch` resolves with the engine's verdict — show rejections, they're your `ctx.invalid` messages:

```tsx
// src/phone.tsx
import { useState } from 'react'
import type { PhoneUiProps } from '@boardr/sdk'
import type { TapRacePublic } from './logic'

export default function Phone({ playerID, view, meta, dispatch }: PhoneUiProps<{ public: TapRacePublic }>) {
  const { taps, target } = view.public
  const [error, setError] = useState<string | null>(null)

  if (meta.gameover) {
    return <h2>{meta.gameover.winner === playerID ? 'You win! 🏆' : 'Game over'}</h2>
  }

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <p>{taps[playerID] ?? 0} / {target}</p>
      <button
        style={{ width: '70vmin', height: '70vmin', borderRadius: '50%', fontSize: '3rem' }}
        onClick={async () => {
          const result = await dispatch('tap')
          setError(result.ok ? null : result.reason)
        }}
      >
        TAP
      </button>
      {error && <p>{error}</p>}
    </div>
  )
}
```

## 7. Play it

```sh
npm run build        # bundles logic + UIs to dist/
npx boardr dev       # watch + hot-reload into a running table
```

Open the game from the table's library: **Open lobby** for phones, or pick a player count and hotseat it. Save a change to `logic.ts` mid-game — the match survives the reload with its state intact.

## 8. Make it yours

Ideas that each teach one more SDK concept:

- **A sabotage move** — `steal` sets a rival's taps back; gate it with `canMove` so it's only legal once per game (per-player flags in `public`).
- **Hidden goals** — deal each player a secret bonus condition into `secret[p]` and check it in `endIf`.
- **Rounds** — best of three: keep `round` and `wins` in `public`, reset taps between rounds, end the *game* in `endIf` only at two wins.

Then [write the rulebook, pick an icon, and publish it](/guide/publishing).
