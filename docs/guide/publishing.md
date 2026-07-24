# Publishing your game

Games are shared through the [community registry](https://github.com/DanielTibbing/boardr-community-contribs): a `games.json` index that every table's **Community** tab reads. Getting listed is one pull request.

## Before you publish

A listing lives or dies on its presentation. Make sure your manifest has:

- **`description`** — one or two sentences, ≤ 280 chars. This is your store copy.
- **`tags`** — up to 6, lowercase kebab-case (`dice`, `hidden-info`, `party`). They drive library filtering.
- **`icon`** — an SVG or PNG in the bundle. Games without one get a generated letter tile.
- **`rules`** — a markdown rulebook. Players open it from the table or their phone *mid-game*; a community game without rules is a hard sell at game night.

And obviously: tests pass, and you've playtested on a real table with phones.

## 1. Pack

```sh
npx boardr pack
```

This builds the game, then zips `boardr.game.json` + `dist/` + your icon and rules into `<id>-<version>.boardrgame`. The zip is **reproducible** — same inputs, same sha256 — and the command prints the hash, the size, and a ready-to-paste registry entry:

```json
{
  "id": "io.github.you.your-game",
  "name": "Your Game",
  …
  "downloadUrl": "bundles/io.github.you.your-game/io.github.you.your-game-1.0.0.boardrgame",
  "sha256": "…",
  "sizeBytes": 123456
}
```

## 2. Open the PR

Fork the registry repo and add:

| Path | What |
| --- | --- |
| `bundles/<id>/<id>-<version>.boardrgame` | the packed bundle (or host it yourself at a stable **https** URL and put that in `downloadUrl`) |
| `icons/<id>.svg` | optional store icon shown before install |
| `games.json` | your entry appended — paste the `boardr pack` output, fill in `author` (your GitHub handle) and `homepage` |

CI validates the submission automatically: schema, duplicate ids, sha256/size against the actual bytes, zip safety caps, that the manifest inside the bundle agrees with your entry, and that declared entries/icon/rules files exist. A maintainer reviews and merges; tables pick up the new index within minutes.

## Ids and updates

- Use reverse-DNS you plausibly control — **`io.github.<handle>.<game>`** is the recommended shape. Ids are first-come-first-served; `com.boardr.*` is reserved.
- To ship an update: bump `version`, re-pack, replace the bundle, update `sha256`/`sizeBytes` in your entry. CI warns reviewers when the PR author differs from the entry's `author`.

## The trust model, honestly

Installing a game means **running its code on someone's table** — the logic runs in a worker, the UIs run in the shells. The registry pins bundles by sha256 and CI verifies integrity, but listing is *not* a security audit. That's why:

- every install shows the player a trust dialog naming you and the source, with the line *"this runs code on your table — only install games you trust"*;
- installs can only be triggered from the table itself, never from a phone;
- built-in game ids can't be shadowed by installs.

Write code you'd be comfortable defending in a public PR — because that's exactly what it is.

## Escape hatch: Add from URL

Tables can also install any `.boardrgame` from a direct https URL, skipping the registry — handy for beta-testing with friends. There's no review and no hash pin (TLS only), and the UI says so with a stronger warning. Prefer the registry for anything public.
