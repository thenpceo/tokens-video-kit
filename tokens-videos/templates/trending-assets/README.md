# Trending Assets — 1:1 square

A ~8.5s square (1080×1080) post (matches the Figma "Trending Assets" design): the 3D Tokens mark spins in as a faint background, then the **"Trending Assets"** title, today's **date**, a disclaimer line, and **4 asset rows** animate in — each row is **logo + Name · $TICKER · 24h Volume** with a soft per-card colored accent border — plus a footer (mark · year · tokens.xyz). Single self-contained card, no separate outro.

The rows are **data-driven** — auto-filled with the **top 4 assets on tokens.xyz by 24h volume** from the Tokens API.

## One-command production flow

Use this for cron or any repeatable publish job:

```bash
cd tokens-videos/templates/trending-assets
node render-trending-assets.mjs
```

The script:
- loads env from the repo root `env` / `env.local` plus local `.env` files
- maps `TOKENS_XYZ_API_KEY` to the template's `TOKENS_API_KEY` fetch step
- refreshes top 4 assets by 24h volume from the Tokens API
- downloads logos and writes deterministic `data.js`
- generates a new beat-forward instrumental via ElevenLabs Music API
- normalizes/trims it to `assets/bgm-eleven-latest.wav`
- keeps the current template design choices: light Tokens styling, Solana mark left, low-opacity footer, Tokens lockup right, asset-specific card strokes, count-up volume numbers, and slot tick SFX
- runs `npx hyperframes lint`, `npx hyperframes validate`, then renders a timestamped MP4 into `renders/`

Required env:

```bash
TOKENS_XYZ_API_KEY=...
ELEVENLABS_API_KEY=...
```

Optional flags:

```bash
node render-trending-assets.mjs --skip-music      # reuse existing bgm-eleven-latest.wav
node render-trending-assets.mjs --skip-fetch      # reuse existing data.js/logos
node render-trending-assets.mjs --skip-validate   # render without lint/validate
node render-trending-assets.mjs --skip-render     # prepare assets only
```

Example cron entry, assuming Node/FFmpeg are on PATH:

```cron
15 * * * * cd /Users/nicholas/Documents/Tokens/tokens-videos/templates/trending-assets && /opt/homebrew/bin/node render-trending-assets.mjs >> cron.log 2>&1
```

## Manual refresh (then render)

The composition renders deterministically, so data is baked in ahead of time by a fetch step:

```bash
cd trending-assets
TOKENS_API_KEY=tok_xxx node fetch-trending.mjs      # pulls top 4 by 24h volume, downloads logos, writes data.js
npx hyperframes render --output trending.mp4
```

`fetch-trending.mjs`:
- `GET https://api.tokens.xyz/v1/assets/trending` with header `x-api-key: $TOKENS_API_KEY` (docs: https://docs.tokens.xyz/v1)
- sorts by `market.volume24hUSD`, takes the top N (default 4, pass a number to change)
- downloads each logo to `assets/logoN.<ext>` based on the response content type
- writes `data.js` → `window.TRENDING = [{ rank, symbol, name, logo, priceText, volText, changeText, up }, …]`

The composition reads `window.TRENDING` (loaded via `<script src="data.js">`) and builds the rows. `data.js` is committed with a recent snapshot so it renders out of the box; re-run the fetch to update.

## Keep the API key safe

Pass the key via the `TOKENS_API_KEY` env var — **never hard-code it** in `data.js`, the HTML, or commits (the generated `data.js` contains only public data, no key). Keep keys server-side per the Tokens API docs.

## Notes
- The design shows **Name · $TICKER · 24h Volume** (no price/% change). `fetch-trending.mjs` tidies long names (drops parentheticals, "- Backed Securities", "Wrapped"); very long ones still ellipsis-truncate — widen `.ta-name`'s column or drop its font size to fit more.
- Today's date is baked at fetch time (`window.TRENDING_DATE`), so re-fetch to refresh it.
- Per-card accent colors are mapped in `index.html`: SpaceX black, HYPE/Hyperliquid green, Coinbase BTC blue, Ether gray, with positional fallbacks.
- Same brand system as the other templates (3D logo bg, lofi bed + SFX, grain/vignette), with ElevenLabs music and count-up tick SFX handled by `render-trending-assets.mjs`.
