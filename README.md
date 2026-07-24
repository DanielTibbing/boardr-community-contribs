# boardr community registry

**📚 Developer docs: <https://danieltibbing.github.io/boardr-community-contribs/>** — getting started, SDK guide, tutorial, publishing guide, protocol reference. Source lives in [`docs/`](docs/) and deploys to this repo's GitHub Pages on every push.

**🤖 AI skill:** [`skills/boardr-game-dev`](skills/boardr-game-dev/SKILL.md) teaches any coding agent to build boardr games.

The curated index of community-made [boardr](https://github.com/DanielTibbing/boardr) games.
Boards fetch `games.json` from this repo to render their **Community** tab; installing a
game downloads the pinned `.boardrgame` bundle and verifies its sha256.

> **Trust statement (shown verbatim to players before every install):**
> *This runs code on your table — only install games you trust.*
>
> Listing here means a maintainer skimmed the PR and CI verified the bundle's
> integrity (hash, size, manifest agreement). It is **not** a security audit of
> the game's code. Bundles execute on the board that installs them.

## Submitting a game

1. Build and pack your game:

   ```sh
   npx boardr pack
   ```

   This produces `<id>-<version>.boardrgame` and prints its sha256, size and a
   ready-to-paste registry entry.

2. Fork this repo and add:
   - `bundles/<id>/<id>-<version>.boardrgame` — the packed bundle
     (recommended; you may instead host it yourself at a stable **https** URL
     and put that absolute URL in `downloadUrl`)
   - `icons/<id>.svg` (or `.png`) — optional store icon
   - your entry appended to `games` in `games.json` (paste the `boardr pack`
     output and fill in `author` — your GitHub handle — and `homepage`)

3. Open a PR. CI validates the submission (see below); a maintainer reviews
   and merges. Boards pick up the new index within minutes (5-minute cache).

### Entry format

```jsonc
{
  "id": "io.github.yourhandle.yourgame",   // lowercase [a-z0-9.-]
  "name": "Your Game",
  "description": "One or two sentences, max 280 chars.",
  "tags": ["dice", "family"],               // max 6, lowercase kebab-case
  "version": "1.0.0",
  "sdkVersion": "^0.1.0",
  "players": { "min": 2, "max": 6 },
  "phoneMode": "optional",                  // none | optional | required
  "author": "yourhandle",                   // your GitHub handle
  "homepage": "https://github.com/yourhandle/yourgame",
  "iconUrl": "icons/io.github.yourhandle.yourgame.svg",  // or absolute https URL, or null
  "downloadUrl": "bundles/io.github.yourhandle.yourgame/io.github.yourhandle.yourgame-1.0.0.boardrgame",
  "sha256": "…64 hex chars, printed by boardr pack…",
  "sizeBytes": 123456
}
```

Relative `downloadUrl`/`iconUrl` paths resolve against this repo's raw URL.

## Rules

- **Ids**: use reverse-DNS you plausibly control — `io.github.<handle>.<game>`
  is recommended. Ids are **first come, first served**, enforced by PR review.
  New `com.boardr.*` ids are rejected (reserved for built-ins).
- **Updates**: bump `version`, replace the bundle, update `sha256`/`sizeBytes`.
  CI warns when the PR author differs from the entry's `author` so reviewers
  look twice before someone else updates your game.
- **Duplicate fields**: the entry intentionally duplicates the manifest inside
  the bundle — one fetch renders the whole store. CI fails the PR if they
  disagree.
- **Rulebook**: strongly recommended. Declare `"rules": "rules.md"` in your
  manifest and ship the markdown file in the bundle — players can open it from
  the table or their phone at any point during a game. CI checks the declared
  file exists.

## What CI checks (`scripts/validate.mjs`)

- `games.json` parses and matches the schema; no duplicate ids
- no new `com.boardr.*` ids
- for each entry changed in the PR:
  - the bundle bytes match `sha256` and `sizeBytes`
  - the zip is within caps (500 entries / 50 MB per file / 100 MB total) and
    contains no unsafe paths
  - the manifest inside the bundle agrees with the entry (id, name, version,
    sdkVersion, players, phoneMode, description, tags)
  - every file declared in `entries` exists in the bundle
- bundles are submitted **prebuilt**; CI validates structure and integrity,
  it does not build or execute game code
