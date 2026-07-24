# CLI

The `boardr` CLI covers the whole authoring loop. It ships with the monorepo (`packages/cli`); inside a scaffolded game it's a dev dependency, so `npx boardr …` just works.

## `boardr create <name>`

Scaffolds a complete, working game in `./<name>/` — Tap Race, with logic, board and phone UIs, tests, an icon, a rulebook, and a manifest wired for all of them. `npm install && npm run build` and it's playable.

## `boardr build [dir]`

Bundles the game folder to `dist/`:

- `src/logic.ts` → `dist/logic.js` **and** `dist/logic.cjs` (the `.cjs` twin lets plain folders dropped into `~/.boardr/games` load without a `package.json`)
- `src/board.tsx` → `dist/board.js`, `src/phone.tsx` → `dist/phone.js` — self-contained ESM; React and `@boardr/sdk` are aliased to the shells' shared instances, so your bundle never double-loads React
- imported `.css` is emitted alongside as sibling files

## `boardr dev [dir] [--server URL]`

`build` in watch mode, plus hot-reload: after every successful rebuild it POSTs `/dev/reload/<id>` to the board server (default `http://127.0.0.1:8720`). The table:

1. rescans the catalog,
2. snapshots any live match of your game,
3. swaps the new logic in and **restores the match** — same state, same RNG position,
4. tells connected shells to re-import your UI bundles.

Save a file mid-game and keep playing.

## `boardr pack [dir]`

Builds, then zips `boardr.game.json` + `dist/**` + the declared icon and rules into `<id>-<version>.boardrgame`. Entries are sorted with fixed timestamps, so **the same inputs always produce the same sha256** — that hash is what the registry pins and tables verify. Prints the hash, size, and a paste-ready registry entry for your [submission PR](/guide/publishing).
