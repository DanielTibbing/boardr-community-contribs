# The SDK

A boardr game is a plain object passed to `defineGame`: how to set up state, which moves exist, and when the game ends. The engine handles everything else — turn order, validation, views, replay, hot-reload.

```ts
import { defineGame, type GameState, type PlayerID } from '@boardr/sdk'

export default defineGame<MyState>({
  name: 'my-game',
  minPlayers: 2,
  maxPlayers: 4,
  setup: (ctx) => ({ public: { … }, secret: { … } }),
  moves: { … },
  endIf: (state) => { … },
})
```

## The three-bucket state

Privacy falls out of the *shape* of your state, not out of code you write:

```ts
interface GameState<Pub, Sec, Int> {
  /** visible to everyone: the board and all phones */
  public: Pub
  /** secret[p] is visible ONLY to player p (their rack, their hole cards) */
  secret: Record<PlayerID, Sec>
  /** never sent to ANY client (the shuffled deck, the tile bag) */
  internal?: Int
}
```

The engine derives what each client sees: the board gets `{ public }`, player `p` gets `{ public, secret: secret[p] }`, and `internal` never crosses the wire. Poker's deck and everyone's hole cards stay private without a single line of filtering code. Override `boardView` / `playerView` only for exotic cases (co-op reveals, spectator modes).

::: warning State must stay plain JSON
No `Map`, `Set`, class instances, or functions. State is snapshotted, diffed, and shipped over WebSockets.
:::

## Determinism

Game logic runs sandboxed in a worker and must be a **pure function of (state, move, seed)** — that's what makes replay, hot-reload, and (eventually) reconnection-proof networking work.

- Randomness **only** through `ctx.random` — it's seeded by the framework. `Math.random()` and `Date.now()` **throw** inside the sandbox.
- A rejected move consumes no randomness and mutates nothing.

```ts
ctx.random.die(6)        // 1..6
ctx.random.dice(5, 6)    // five dice
ctx.random.shuffle(arr)  // Fisher–Yates, returns a new array
ctx.random.number()      // [0, 1)
ctx.random.pick(items)
```

## Moves

Moves mutate a draft of the state (Immer under the hood — mutate freely, it's recorded immutably):

```ts
moves: {
  // shorthand: just a function
  pass: (state, ctx) => {
    ctx.events.endTurn()
  },

  // full form
  playCard: {
    // cheap guard: drives phone button enablement AND server-side pre-validation
    canMove: (state, ctx) => state.public.phase === 'playing',
    // ignore whose turn it is (bids, challenges, races)
    alwaysAllowed: false,
    move: (state, ctx, args) => {
      const { card } = args as { card: string }
      if (!isLegal(state, card)) return ctx.invalid(`can't play ${card} now`)
      state.public.pile.push(card)
      state.secret[ctx.playerID]!.hand = state.secret[ctx.playerID]!.hand.filter((c) => c !== card)
      ctx.events.endTurn()
    },
  },
}
```

Inside a move you have `ctx`:

| | |
| --- | --- |
| `ctx.playerID` | who this move executes as |
| `ctx.players` | seat-ordered `PlayerInfo[]` (id, seat, name, connection) |
| `ctx.currentPlayer`, `ctx.turn` | whose turn, which turn |
| `ctx.random` | the seeded RNG |
| `ctx.invalid(reason)` | reject the move — nothing commits, the reason reaches the dispatching UI |
| `ctx.events.endTurn({ next? })` | end the turn, optionally naming the next player |
| `ctx.events.endGame(result?)` | end the game immediately |

## Turn order

By default the turn passes to the next seat clockwise when a move calls `ctx.events.endTurn()`. Take control with either:

- `ctx.events.endTurn({ next: playerId })` — explicit, per-move. Poker uses this for its betting order.
- `turn: { next: (state, ctx) => playerId }` — a game-wide rule.

Moves from a player who isn't `currentPlayer` are rejected unless the move is `alwaysAllowed` (then gate it yourself with `canMove`/`ctx.invalid`).

## Interrupt windows

Some games need *several* players to act at once — mahjong claims (pèng/chī/hú), simultaneous bids, reaction cards. Define `actors` and the engine gates moves on your set instead of the single turn holder:

```ts
actors: (state, ctx) =>
  state.public.claim
    ? playersWhoHaveNotRespondedYet(state)   // the window
    : [ctx.currentPlayer],                   // normal turns
```

The turn holder stays `currentPlayer`; `meta.actors` tells every UI who may act right now. Keep the window's bookkeeping (who's eligible, who has responded, what priority wins) in `public` state and resolve it in the responding moves — see `games/mahjong` for the full pattern.

## Ending the game

`endIf` runs after every committed move:

```ts
endIf: (state, ctx) => {
  const winner = findWinner(state)
  if (!winner) return undefined
  return { winner, scores: { …per-player numbers… } }
}
```

Return `{ winner }`, `{ winner: [ties] }`, `{ draw: true }` — plus optional `scores`. Once set, the match is over and further moves are rejected. A move can also call `ctx.events.endGame(result)` directly.

## Card games

The SDK ships standard-deck helpers — a card is a two-char string like `"AS"` or `"TD"`:

```ts
import { makeDeck, rankOf, suitOf, rankValue, isRedSuit, SUIT_SYMBOLS } from '@boardr/sdk'

setup: (ctx) => ({
  internal: { deck: ctx.random.shuffle(makeDeck()) },  // stays server-side
  …
})
```

Hand *evaluation* is game-specific — see `games/poker/src/evaluate.ts` for a tested 7-card Hold'em evaluator you can crib from.

## UIs

Board and phone UIs are React components in your bundle; the shells load them at runtime and share their React instance with yours (import React normally — the build aliases it).

```tsx
// src/board.tsx — the shared table screen
export default function Board({ view, meta, dispatch }: BoardUiProps<MyView>) { … }

// src/phone.tsx — one player's private controller
export default function Phone({ playerID, view, meta, isActive, dispatch }: PhoneUiProps<MyView>) { … }
```

- `view` is that client's filtered state; `meta` carries `players`, `currentPlayer`, `gameover`, and `legalMoves` (from your `canMove` guards — use it to enable buttons).
- `dispatch(move, args)` returns `{ ok } | { ok: false, reason }` — surface the reason, it's your `ctx.invalid` message.
- `@boardr/sdk/ui` has helpers: `tableLayout`/`Seat` (position widgets around the table edges, rotated to face each player), `WaitingOverlay`, and `MarkdownLite` (the same renderer the shells use for rulebooks).

## Testing

`@boardr/testkit` runs your logic against the real engine, no server needed:

```ts
import { createTestMatch } from '@boardr/testkit'

const h = createTestMatch(game, { numPlayers: 2, seed: 'stable' })
h.moves['playCard']!({ card: 'AS' }, { as: 'p0' })   // throws if rejected
expect(h.getState('p0')).toMatchObject({ … })         // p0's filtered view
expect(h.match.gameover).toBeNull()
```

Same seed + same moves = same game, so tests are exact. Use `h.match.dispatch(...)` directly when you want to *assert* a rejection.
