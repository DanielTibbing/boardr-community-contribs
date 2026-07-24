---
name: boardr-game-dev
description: Build, test, and publish games for boardr, the digital boardgame table (a shared board screen that is also the game server, with players' phones as private hands). Use this skill whenever the user wants to create a new boardr game, add moves, UIs, rulebooks, or tests to an existing one, debug why a move is rejected or secret state is leaking, or pack and publish a game to the community registry. Trigger on any mention of boardr, boardr.game.json, @boardr/sdk, defineGame, a "table game" with phones as controllers, or hidden information (hole cards, racks, hands) on players' phones — even if the user doesn't say "boardr game" explicitly.
---

# Building boardr games

This file is self-contained and agent-agnostic: copy the `boardr-game-dev` folder into any agent's skills directory (Claude Code, Codex, Antigravity, …) or read it inline. Full prose docs: https://danieltibbing.github.io/boardr-community-contribs/

## Architecture in five lines

- The **board app** (Electron) is the shared table screen AND the authoritative server. **Phones** join over LAN WebSockets by scanning a lobby QR — the phone app is served by the board itself, nothing to install.
- A game is a **folder**: `boardr.game.json` (manifest) + built `dist/` bundles — a logic module and optional React UIs for board and phone.
- **Game logic runs sandboxed in a worker** on the table and must be deterministic: a pure function of (state, move, seed).
- **Privacy comes from state shape**, not code: `public` (everyone), `secret[playerId]` (that player only), `internal` (never leaves the server). The engine filters views per client; you never write filtering code.
- The board renderer is itself just a WS client of its embedded server — same protocol as phones.

## Workflow: scaffold, then iterate

The SDK, CLI, and testkit are on npm — scaffold a game anywhere:

```sh
npx @boardr/cli create my-game
cd my-game
npm install
npm run build        # bundle logic + UIs to dist/
npm test             # vitest against the real engine
npx boardr dev       # rebuild on save + hot-reload into a running table (state survives!)
```

(after `npm install`, the `boardr` bin is available locally — `npx boardr build|dev|pack`)

Contributing a **built-in** game inside the boardr monorepo instead? Games live in `games/`, use `"workspace:*"` for the `@boardr/*` deps, and set the build script to `node ../../packages/cli/dist/cli.js build` like the existing games (the boardr bin can't link before the CLI is built on a fresh clone).

The scaffold is a complete working game (Tap Race) — which means its manifest values (`id`, player counts, `description`, `tags`, the icon and rules.md contents) are **Tap Race placeholders**. Replace them all for your game, or the store card will lie.

**Iterate in this order**: logic → tests green → board UI → phone UI → rules.md + icon. Logic-first matters because the testkit runs the real engine — a game with passing tests already works before you touch pixels. A phone UI is optional even for phone-joinable games: without a `phoneUi` entry, phones show a generic "your turn / waiting" card, which is fine for games where all action happens on the board.

To see it on the table: `pnpm --filter @boardr/board dev` from the repo root; the library shows every game in `games/`.

## The SDK, distilled

```ts
import { defineGame, type GameState, type PlayerID } from '@boardr/sdk'

type MyState = GameState<Pub, Sec, Int>   // { public: Pub, secret: Record<PlayerID, Sec>, internal?: Int }

export default defineGame<MyState>({
  name: 'my-game',
  minPlayers: 2,
  maxPlayers: 6,
  setup: (ctx) => ({ public: {…}, secret: {…}, internal: {…} }),
  moves: {
    draw: {
      canMove: (state, ctx) => boolean,   // cheap guard: feeds phones' legalMoves AND server pre-validation
      alwaysAllowed: false,               // true = ignore turn order (races, bids, "next hand" buttons)
      move: (state, ctx, args) => { /* mutate the draft freely (Immer) */ },
    },
    pass: (state, ctx) => { ctx.events.endTurn() },   // shorthand form
  },
  turn: { next: (state, ctx) => PlayerID },           // optional; default = next seat clockwise on endTurn
  actors: (state, ctx) => PlayerID[],                 // optional; who may act NOW (default [currentPlayer]) —
                                                      // widen it for interrupt windows (mahjong pèng/chī/hú,
                                                      // simultaneous bids); meta.actors tells UIs who's up
  endIf: (state, ctx) => ({ winner, scores } | undefined),  // checked after every committed move
})
```

Inside moves, `ctx` gives you: `playerID` (who is acting), `players` (seat-ordered: id/seat/name/connection), `currentPlayer`, `turn`, `random`, `invalid(reason)` (reject — nothing commits, reason reaches the dispatching UI), `events.endTurn({ next? })`, `events.endGame(result?)`.

`canMove` always runs **server-side against the full state** — it may read `internal` (e.g. `deck.length > 0`) even though clients never see it; the resulting booleans reach UIs through `meta.legalMoves`.

Randomness (**only** legal source): `ctx.random.die(sides?)`, `.dice(n, sides?)`, `.shuffle(arr)` (returns new array), `.number()`, `.pick(arr)`.

Cards: `makeDeck()` (52 cards as `"AS"`, `"TD"` strings), `rankOf`, `suitOf`, `rankValue` (2–14), `isRedSuit`, `SUIT_SYMBOLS` — all from `@boardr/sdk`. Shuffle the deck into `internal`, deal into `secret[p]`, flip into `public`. A tested 7-card hold'em evaluator lives in `games/poker/src/evaluate.ts` — copy it rather than rewriting.

### UIs

`src/board.tsx` / `src/phone.tsx` export default React components. Import React normally — the build aliases it to the shell's instance.

```tsx
export default function Board({ view, meta, dispatch }: BoardUiProps<V>) {…}
export default function Phone({ playerID, view, meta, isActive, dispatch }: PhoneUiProps<V>) {…}
```

- `view` = that client's filtered state: board gets `{ public }`; phone `p` gets `{ public, secret: <secret[p]> }`.
- `meta` = `{ players, currentPlayer, turn, gameover, legalMoves }`. Drive button enablement from `meta.legalMoves[moveName]` — it evaluates your `canMove` guards server-side.
- **The two dispatches differ.** Phone: `await dispatch(move, args)` resolves `{ ok: true } | { ok: false, reason }` — always surface `reason`, it's your own `ctx.invalid` message. Board: `dispatch(move, args, opts?)` is fire-and-forget (`void`; rejections surface as a shell toast); its `opts.as` names which player acts, **defaulting to `currentPlayer`** — that default is what makes hotseat board-only games work.
- Helpers in `@boardr/sdk/ui`: `tableLayout`/`Seat` (place widgets around table edges, rotated toward each player), `WaitingOverlay`, `MarkdownLite`.

### Tests

```ts
import { createTestMatch } from '@boardr/testkit'
const h = createTestMatch(game, { numPlayers: 3, seed: 'stable' })
h.moves['draw']!({ count: 2 }, { as: 'p1' })          // THROWS on rejection — a passing call is an assertion
h.match.dispatch('draw', {}, 'p2')                     // returns {ok:false,…} — use to assert rejections
h.getState()        // board view;  h.getState('p1') = p1's filtered view
h.match.gameover    // null | { winner, scores }
h.match.currentPlayer
h.match.snapshot().state   // FULL state incl. internal — for asserting hidden things
```

When a test needs to know hidden information (the next card in the deck, the bag order), read it from `h.match.snapshot().state.internal` — the filtered views deliberately can't show it to you.

Same seed + same moves = identical game. Good suites assert: setup shape, a legal-move happy path, `ctx.invalid` rejections, turn order, the end condition, and — for hidden-info games — that `JSON.stringify(h.getState())` and other players' views do **not** contain secret values.

## Pitfalls (each has burned someone)

1. **`Math.random()` and `Date.now()` throw in the logic sandbox.** All chance through `ctx.random`; timestamps don't belong in game state at all.
2. **State must stay plain JSON.** No `Map`/`Set`/class instances/functions — it's snapshotted, structured-cloned, and serialized. `Record<string, T>` and arrays only.
3. **Secrets leak through `public`, not through bugs in the engine.** If you put a rack in `state.public.racks[p]`, every phone sees it. Per-player hidden info → `secret[p]`; server-only info (deck order, tile bag) → `internal`. Verify with a stringify test on the board view.
4. **Phones run over plain http on a LAN IP** — not a secure context. `crypto.randomUUID`, clipboard, etc. are unavailable in phone UIs on real devices (works on localhost, breaks at game night). Use fallbacks.
5. **`alwaysAllowed` skips the turn check, nothing else.** Gate who may act and when with `canMove` + `ctx.invalid`, or any player can fire the move at any time.
6. **A rejected move must reject via `ctx.invalid`**, not by silently returning — silence commits the (unchanged) state and consumes the player's intent.
7. **`endTurn({ next })` for dynamic turn order.** Poker-style flow (dealer rotation, betting order, skipping folded players) is: track eligibility in `public`, always pass `next` explicitly. Never mutate `meta`/`currentPlayer` yourself.
8. **Manifest `entries` must exist after `boardr build`** or the game is refused with a "run boardr build?" problem; a declared-but-missing `icon`/`rules` only warns. `phoneMode: "required"` removes hotseat — choose it when the game has secrets, `"optional"` otherwise, `"none"` for board-only.
9. **For SDK contributors only**: new `@boardr/sdk` exports must also be added to `packages/sdk/shims/sdk.mjs`, and the board/phone shells rebuilt, before game UI bundles can import them.

## Ship it

Every game should carry its store presence in the manifest: `description` (≤280 chars), `tags` (≤6, kebab-case), `icon` (svg in the bundle), and `rules` (markdown rulebook — players open it from the table or their phones mid-game; structure it Goal / How to play / Scoring / Ending like the built-ins).

```sh
npx boardr pack   # reproducible <id>-<version>.boardrgame + sha256 + a paste-ready registry entry
```

Publish = one PR to https://github.com/DanielTibbing/boardr-community-contribs adding the bundle under `bundles/<id>/` and the printed entry to `games.json`. CI verifies hash, size, zip safety, and manifest agreement. Use an id you control: `io.github.<handle>.<game>` (`com.boardr.*` is reserved). Installing runs your code on someone's table — the store says so to every player, so write code you'd defend in public.

## Reference games (read these before inventing patterns)

These live in the boardr monorepo (`games/`); if you're working standalone, the docs site covers the same patterns.

| Game | Teaches |
| --- | --- |
| `games/dicey` | turns, categories, board-only UI, `phoneMode: optional` |
| `games/rackword` | hidden racks in `secret`, tile bag in `internal`, custom board interactions |
| `games/poker` | cards, dynamic turn order via `endTurn({next})`, `alwaysAllowed` next-hand, showdown reveals moved into `public` |
| `games/mahjong` | interrupt windows via `actors` (pèng/chī/hú with priority resolution), claim bookkeeping in `public`, crafted-snapshot tests via `Match.restore` |

Engine internals: `packages/sdk/src/engine.ts`. Protocol: `packages/protocol/src/messages.ts`. Server: `apps/board/src/server/`.
