# Templates

Ready-to-render Tokens compositions. Retheme by overriding **variables** (no code editing) or by replacing asset files. Each template is a self-contained HyperFrames project (`index.html` + `assets/`).

## Catalog

### `breaking-ath` — "Breaking ATH / New Record High"
A ~14s announcement: **3D logo + headline → counting stat over a chart → token cubes → logo outro.** Built for record-high / milestone / volume / tokenized-equities moments. This is the flagship template.

Scenes: (1) BREAKING headline over the spinning 3D mark; (2) a chart draws while a stat counts up; (3) a section heading + a conveyor of token cubes; (4) the `tokens.xyz` logo lockup with a sheen.

**Aspect variants:**
- `breaking-ath` — **16:9** (1920×1080), the landscape master. All 4 scenes.
- `breaking-ath-square` — **1:1** (1080×1080), for feed/Instagram. A tightened **3-scene** cut (~11.5s): drops the cubes scene and folds "Tokenized Equities Volume" into scene 2's centered stat label. Same variable schema minus `cube1…7`/`scene3_heading`.

For 9:16 vertical, copy the square variant and reflow (same kind of edits: dimensions + spacing).

### `trending-assets` — "Trending Assets" (1:1, data-driven)
A ~8.5s square post: 3D logo background + a "Trending Assets" title and **4 asset rows** (logo, name, symbol, 24h volume) that animate in over a low-opacity branded footer. The rows are **auto-filled from the Tokens API** — top 4 assets by 24h volume.

Run the full production flow:
```bash
cd tokens-videos/templates/trending-assets
node render-trending-assets.mjs
```

That one command refreshes Tokens API data/logos, generates a new beat-forward ElevenLabs instrumental, preserves the current design decisions (Solana mark footer, Tokens lockup, low-opacity gray footer, asset-specific strokes, count-up numbers, slot tick SFX), validates with HyperFrames, and renders a timestamped MP4 into `renders/`.

Manual data-only refresh:
```bash
cd templates/trending-assets
TOKENS_API_KEY=tok_xxx node fetch-trending.mjs    # writes data.js + downloads logos
npx hyperframes render --output trending.mp4
```
Data flow: `fetch-trending.mjs` calls `GET api.tokens.xyz/v1/assets/trending` (header `x-api-key`), sorts by `volume24hUSD`, bakes the top 4 into `data.js` (`window.TRENDING`). The composition reads that — no network at render time. Keep the API key in the `TOKENS_API_KEY` env var, never committed. See `templates/trending-assets/README.md`.

## How to retheme (Path A)

1. **Copy** the template to a working folder (so you keep the original clean):
   ```bash
   cp -r tokens-videos/templates/breaking-ath my-ath-video && cd my-ath-video
   ```
2. **Preview** with defaults: `npx hyperframes preview` → open the Studio URL.
3. **Render** with your overrides:
   ```bash
   npx hyperframes render --variables '{
     "breaking_line1": "BREAKING:",
     "breaking_line2": "NEW RECORD HIGH",
     "stat_value": 250, "stat_prefix": "$", "stat_suffix": "M", "stat_label": "Volume",
     "scene3_heading": "Tokenized Equities"
   }' --output my-ath-video.mp4
   ```
   Or put the JSON in a file and use `--variables-file vars.json`.

### Variable schema (`breaking-ath`)

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `breaking_line1` | string | `BREAKING:` | Scene 1, large line |
| `breaking_line2` | string | `NEW RECORD HIGH` | Scene 1, secondary line |
| `stat_prefix` | string | `$` | Before the number |
| `stat_value` | number | `100` | The number counts up to this |
| `stat_suffix` | string | `M` | After the number (M, B, %, …) |
| `stat_label` | string | `Volume` | Small uppercase label under the stat |
| `scene3_heading` | string | `Tokenized Equities` | Scene 3 centered heading |
| `cube1`…`cube7` | string | `assets/cubeN.svg` | Token-cube logo paths (see below) |
| `music` | string | `assets/bgm.wav` | Music bed path (wav/mp3) |

Keep copy short — display type is `white-space: nowrap`, so very long lines can run off-frame. One-to-four words per line is the sweet spot.

## Swapping the token logos (scene 3 cubes)

Two ways:

1. **Drop-in (simplest):** replace `assets/cube1.svg … cube7.svg` with new cubes. Keep the same isometric cube style (312×251 art with the token glyph on the top face) so they sit on the conveyor correctly. New cube art belongs in the brand kit — match the existing ones.
2. **Per-render override:** point the `cube1…cube7` variables at other files, e.g. `--variables '{"cube1":"assets/my-token.svg"}'`.

The conveyor is intentionally offset left (`--ox:-1005px`) so the cubes read in the lower-left and run off the edges — **don't "fix" that**, it's the intended composition.

## Swapping copy/logos for a *different brand moment*

The template is tuned for ATH/milestone posts. For a meaningfully different beat (e.g. a feature launch), it's usually cleaner to treat it as **Path B** (a new video) and reuse the brand system + assets, rather than forcing the template's structure.

## Adding a new template

When you build a new reusable composition:
1. Make it a self-contained project folder under `templates/<name>/` with its own `assets/`.
2. Expose the swappable bits as HyperFrames variables on the `<html data-composition-variables=...>` root and read them with `window.__hyperframes.getVariables()` (see `breaking-ath/index.html` for the pattern — set text/srcs *before* splitting letters into spans).
3. Add a `README.md` documenting its variables, and a row to the Catalog above.
4. Keep it on-brand per [brand.md](brand.md).
