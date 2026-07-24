# Getting started

boardr is a digital boardgame table: an app on a shared screen (a touchscreen table, a TV, a laptop) acts as the board **and** the authoritative game server, while everyone's phone becomes their private hand. Games are folders of JavaScript — a logic module that runs sandboxed on the table, plus optional React UIs for the board and the phones.

## What's in the box

| Piece | What it does |
| --- | --- |
| **Board app** | Electron app for the table. Runs the embedded server, renders the shared board, shows the library. |
| **Phone app** | Served by the board itself at `http://<board-ip>:8720`. Phones join by scanning the lobby QR — nothing to install. |
| **`@boardr/sdk`** | `defineGame`, the deterministic match engine, seeded randomness, card helpers, UI helpers. |
| **`boardr` CLI** | Scaffold (`create`), bundle (`build`), hot-reload (`dev`), and package for sharing (`pack`). |

## Run the table

Download the packaged app for your platform from the
[releases page](https://github.com/DanielTibbing/boardr-community-contribs/releases)
and run it. The window that opens is the table. Phones on the same network
browse to the URL it shows (or scan the QR once a lobby is open).

## Make your first game

Everything you need is on npm — scaffold a game anywhere:

```sh
npx @boardr/cli create my-game
cd my-game
npm install
npm run build
npm test
```

You get a complete, working game — **Tap Race** — with logic, a board UI, a phone UI, tests, an icon, and a rulebook. The [tutorial](/guide/tutorial) walks through every line.

### The dev loop

With the board app running on the same machine:

```sh
npx boardr dev
```

This rebuilds on save and hot-reloads the game into the running table — **including a live match**: the engine snapshots state, swaps your new logic in, and carries the game on. Point it at a table elsewhere on the network with `--server http://<board-ip>:8720`.

### Install on a table

Copy the whole game folder (with `dist/` built) into `~/.boardr/games/` on the board machine. No npm install needed there — bundles are self-contained. The library picks it up on the next visit; broken bundles show up as warnings instead of disappearing.

## Where to next

- [The SDK](/guide/sdk) — the mental model: state buckets, moves, determinism.
- [Tutorial](/guide/tutorial) — build Tap Race from an empty folder.
- [Publishing](/guide/publishing) — ship your game to the community registry.
