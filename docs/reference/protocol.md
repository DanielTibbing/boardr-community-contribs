# Wire protocol

Everything — phones *and* the board's own screen — speaks the same JSON protocol over a WebSocket at `ws://<board>:8720/ws`. The board renderer is just a privileged client of its embedded server; that symmetry is what will make a future cloud relay a transport swap rather than a rewrite. You rarely need this page to *build a game* (the SDK hides it), but it's the contract for custom clients, bots, and debugging.

Every frame carries `v: 1` (the protocol version). Schemas live in `@boardr/protocol` as zod definitions — import them for a typed client.

## Session lifecycle

```
phone                    server                     board
  │  hello {phone}         │      hello {board}       │
  │────────────────────────▶◀──────────────────────────│
  │  welcome {token}        │                          │
  ◀────────────────────────│──────────────────────────▶│
  │                         │   createSession {gameId} │
  │                         ◀──────────────────────────│
  │  lobby {seats…}         │                          │
  ◀────────────────────────│──────────────────────────▶│
  │  claimSeat {seat,name}  │                          │
  │────────────────────────▶│                          │
  │  seated {playerId}      │      startSession        │
  ◀────────────────────────│◀──────────────────────────│
  │  state {view…}          │  (per-client filtered)   │
  ◀────────────────────────│──────────────────────────▶│
  │  action {move,args}     │                          │
  │────────────────────────▶│                          │
  │  actionAck / error      │                          │
```

The `welcome` token is the reconnect credential: present it in a later `hello` and the server rebinds your seat and replays your current state. Phones survive lock-screens and dropped Wi-Fi this way.

## Client → server

| Message | Who | Payload | Purpose |
| --- | --- | --- | --- |
| `hello` | all | `clientKind`, `token?`, `name?` | identify / reconnect |
| `ping` / `resync` | all | `t` / — | RTT + request a fresh state push |
| `claimSeat` | phone | `seat`, `name` | sit down in an open lobby |
| `action` | seated / board | `actionId`, `move`, `args[]`, `actAs?` | dispatch a move. `actAs` is board-only (hotseat) |
| `leave` | phone | — | give up the seat |
| `createSession` | board | `gameId` | open a lobby |
| `startSession` | board | — | start with the seated players |
| `startMatch` | board | `gameId`, `playerNames[]` | quick-start hotseat (no phones) |
| `stopMatch` | board | — | tear down the lobby/match |

## Server → client

| Message | Payload | Purpose |
| --- | --- | --- |
| `welcome` | `token`, `clientId`, `playerId`, `sessionId` | session identity |
| `lobby` | `game` (public manifest), `seats[]`, `phase`, `joinUrl` | lobby state; `joinUrl` feeds the QR |
| `state` | `version`, `mode: 'snapshot'`, `view` | your filtered view + `meta` (players, currentPlayer, legalMoves, gameover) |
| `actionAck` | `actionId`, `version` | your move committed |
| `error` | `code`, `message`, `refActionId?` | rejection — codes like `INVALID_MOVE`, `NOT_YOUR_TURN`, `SEAT_TAKEN` |
| `seated` | `seat`, `playerId`, `sessionId` | your claim succeeded |
| `presence` | `clients[]` | board-only: who's connected |
| `sessionEnded` | `reason` | lobby/match torn down |
| `devReload` | `gameId`, `nonce` | dev hot-reload: re-import UI bundles with `?v=nonce` |

## Privacy on the wire

`state.view` is filtered **server-side per recipient** before serialization: the board gets `{ public }`, player *p* gets `{ public, secret: secret[p] }`, and `internal` never leaves the engine. There is no "full state" frame to intercept — a phone on the network can't see another player's rack no matter what it sends.

## HTTP endpoints

The same server also serves: the phone app at `/`, game bundles at `/games/<id>/…`, `GET /api/info` and `/api/games` (library + problems), `GET /api/registry` (community index, annotated), `POST /api/install` + `DELETE /api/install/:id` (**loopback-only** — phones can never install code), and `POST /dev/reload/:gameId` for the dev loop.
