---
name: tokens-videos
description: >-
  Make on-brand motion videos for Tokens (tokens.xyz, the Solana token/equities
  platform) with HyperFrames. Use this whenever someone wants a Tokens video,
  promo, announcement, "Breaking ATH" / new-record-high clip, a tokenized-equities
  or volume/stat reveal, a logo sting, or any branded motion graphic for Tokens —
  even if they don't say "HyperFrames". It ships the Tokens video brand system
  (colors, type, motion, audio, postprocessing), reusable brand assets (3D logo,
  wordmark, token cubes, SFX), and a ready-to-render parameterized "Breaking ATH"
  template you can retheme by swapping copy, the stat, the token logos, and music.
  Pair it with the `hyperframes` skill, which handles the underlying compose/render
  mechanics.
---

# Tokens Videos

This skill turns "make a Tokens video" into either a **2-minute retheme of a template** or a **from-scratch, brand-aligned build** — both ending in an MP4 that looks and sounds like Tokens.

It is a companion to the **`hyperframes`** skill (the HTML→MP4 engine). This skill supplies *what makes it Tokens*; `hyperframes` supplies *how to compose and render*. If `hyperframes` isn't installed, install it first: `npx skills add heygen-com/hyperframes`.

## Pick your path

**Path A — Quick video from a template (minutes).**
The fastest way to ship. Copy a template, override its variables (copy, stat, token logos, music), render. No code editing needed. → Go to [references/templates.md](references/templates.md).

**Cron flow — Trending Assets.**
For the repeatable "top 4 tokenized assets by 24h volume" post, use `templates/trending-assets/render-trending-assets.mjs`. It refreshes Tokens API data/logos from the full curated universe, excludes `crypto` and `stablecoin` categories so tokenized equities, ETFs, and commodities remain eligible, generates a beat-forward ElevenLabs instrumental, keeps the current approved footer/card/count-up/SFX design choices, validates with HyperFrames, and renders a timestamped MP4.

**Path B — A new video, fully on-brand (longer).**
A different concept/structure, but it must feel like the same family. Read the brand system, reuse the assets and motion/audio recipes, and compose in HyperFrames. → Read [references/brand.md](references/brand.md) first, then build with the `hyperframes` skill.

When unsure, default to Path A and adapt — most requests ("a new ATH post", "a volume milestone", "an equities drop") are reskins of the existing template.

## Prerequisites

- **Node.js 22+** and **FFmpeg** on PATH (FFmpeg is used for the audio/SFX recipes).
- The **`hyperframes`** skill + CLI (`npx hyperframes` available).
- This skill's `assets/` (logo, wordmark, token cubes, SFX) — already bundled here.

## Brand non-negotiables (the 10-second version)

Full spec in [references/brand.md](references/brand.md) and [assets/design.md](assets/design.md). The essentials:

- **Light theme.** White canvas (`#FFFFFF` with a faint `#F5F5F8` radial), near-black text. This is the canonical look — do not flip to dark.
- **Type:** Inter, **semibold (600)**, tight tracking (**-9px** on display sizes). Headlines `#323236`, secondary `#5A5A62`, never pure black.
- **Brand green:** Solana mint. Chart stroke uses the `#42A87D → #9EE4C6` gradient; accents/seam use `#14F195 / #0BBF7A`; up/positive `#00BB7F`.
- **The mark is 3D.** The Tokens logo appears as four thick metallic disks rendered in Three.js (not a flat PNG). Reuse the provided setup.
- **Motion:** quick and clean — staggered letter entrances, ease-out settles, a push transition with a mint seam, motion blur on fast exits.
- **Sound:** an electronic music bed + a specific SFX kit (whoosh / cinematic riser / slot-tick / thump / typing / soft-whoosh / sheen). Recipes in [references/audio.md](references/audio.md).
- **Grade:** subtle film grain + vignette over everything; chromatic RGB-shift on the cuts; green bloom on the chart.

If you're reaching for `#000`, Roboto, a dark background, or a flat 2D logo — stop, you've drifted off-brand.

## Assets (bundled)

| Path | What |
|------|------|
| `assets/logo.svg` | Tokens mark (4-circle clover, `#1E1E20`) — also the source shape for the 3D logo |
| `assets/wordmark.svg` | `tokens.xyz` wordmark |
| `assets/cubes/cube1–7.svg` | Isometric token cubes (AMZNX, MSFTX, NVDAX, METAX, AAPLX, TSLA, …) |
| `assets/sfx/*.wav` | The SFX kit — all synthesized, royalty-free, safe to ship/reuse |
| `assets/design.md` | The full light-mode brand design system (source of truth) |
| `templates/breaking-ath/` | The ready-to-render "Breaking ATH / New Record High" composition |
| `templates/trending-assets/` | Cron-ready Tokens API + ElevenLabs + HyperFrames "Trending Assets" composition |

> **Music note:** the SFX are ours (synthesized) and bundled. The **music bed is not** — templates ship a generic synthesized ambient `bgm.wav` as a safe default. Swap in a real track per [references/audio.md](references/audio.md), and **credit the artist / confirm the license** before publishing.

## Workflow (either path)

1. **Scaffold/locate the project.** For a template: copy `templates/breaking-ath/` to a working folder. For a new video: `npx hyperframes init <name>` and copy in the assets you need.
2. **Retheme or compose.** Path A: override variables (see templates.md). Path B: build scenes following brand.md, reusing the 3D-logo block and SFX.
3. **Check:** `npx hyperframes lint` (and `validate`). Fix errors. Note: this composition uses an SVG filter + WebGL, so `inspect` can be slow to load — lint/validate are the reliable gates.
4. **Render:** `npx hyperframes render --output my-video.mp4` (add `--variables '{...}'` for template overrides).
5. **Verify** by extracting a few frames with ffmpeg before declaring done.

## References

- [references/brand.md](references/brand.md) — the full video brand system: color, type, motion, audio, postprocessing, do/don't. **Read for Path B.**
- [references/templates.md](references/templates.md) — template catalog, the variable schema, and how to retheme (copy, stat, token logos, music). **Read for Path A.**
- [references/audio.md](references/audio.md) — the SFX kit + exact FFmpeg recipes, and how to source/level/credit a music bed.
- [references/build-and-render.md](references/build-and-render.md) — scaffold, preview, render, troubleshooting, and the gotchas learned building the original (clip painting, asset cache-busting, render seeking).
