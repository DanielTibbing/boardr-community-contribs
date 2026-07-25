# Game manifest

Every bundle has a `boardr.game.json` at its root. It's the game's identity card: the table's catalog scans for it, the store renders from it, and CI validates against it.

```json
{
  "manifestVersion": 1,
  "id": "io.github.you.your-game",
  "name": "Your Game",
  "version": "1.0.0",
  "minPlayers": 2,
  "maxPlayers": 6,
  "phoneMode": "optional",
  "sdkVersion": "^0.2.0",
  "entries": {
    "logic": "dist/logic.js",
    "boardUi": "dist/board.js",
    "phoneUi": "dist/phone.js"
  },
  "optionsSchema": {
    "easyMode": {
      "type": "boolean",
      "label": "Easy Mode",
      "default": false
    },
    "pointsToWin": {
      "type": "number",
      "label": "Points to Win",
      "min": 10,
      "max": 100,
      "step": 10,
      "default": 50
    },
    "variant": {
      "type": "select",
      "label": "Game Variant",
      "options": ["Standard", "Speedrun", "Chaos"],
      "default": "Standard"
    }
  },
  "description": "One or two sentences for the store copy.",
  "tags": ["cards", "bluffing"],
  "icon": "icon.svg",
  "rules": "rules.md"
}
```

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `manifestVersion` | ✓ | always `1` |
| `id` | ✓ | lowercase `[a-z0-9.-]`, reverse-DNS. Globally unique; `io.github.<handle>.<game>` recommended. `com.boardr.*` is reserved for built-ins. |
| `name` | ✓ | display name, 1–64 chars |
| `version` | ✓ | your release version; the store shows "Update" when it differs from the installed one |
| `minPlayers` / `maxPlayers` | ✓ | seat limits, enforced by the engine and the lobby |
| `phoneMode` | ✓ | `none` (board-only / hotseat), `optional` (both), `required` (private info — no hotseat) |
| `sdkVersion` | ✓ | semver range of `@boardr/sdk` you built against: `^x.y.z` or exact. Incompatible games are refused with a clear message instead of crashing. |
| `entries.logic` | ✓ | built logic module (worker-side). `boardr build` emits `dist/logic.js` (+ a `.cjs` twin for dropped-in folders) |
| `entries.boardUi` | – | built board UI (ESM, React) |
| `entries.phoneUi` | – | built phone UI. Required in practice when `phoneMode` isn't `none` — phones fall back to a generic turn card without it |
| `optionsSchema` | – | custom options schema for pre-game configuration (e.g. game rules, limits, modes). See the SDK docs for logic usage. |
| `description` | – | ≤ 280 chars; store copy |
| `tags` | – | ≤ 6, lowercase kebab-case; drive library filters |
| `icon` | – | relative path to an svg/png in the bundle |
| `rules` | – | relative path to a markdown rulebook in the bundle — reachable from the table and phones at any point in a game |

**Degradation:** a declared-but-missing `icon` or `rules` file becomes a library warning (the game stays playable); a missing `entries.*` file blocks the game with a "run `boardr build`?" hint.

## The rulebook file

`rules` points at plain markdown rendered with a safe subset: headings, paragraphs, `**bold**` / `*italic*` / `` `code` ``, lists, blockquotes, fenced code, and `---` rules. Raw HTML renders as text. Keep it structured like a physical rulebook — Goal, How to play, Scoring, Ending — see the built-in games for the pattern.
