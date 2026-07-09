# Agent Handoff

This repository packages the Tokens HyperFrames video workflow for reuse.

1. Read [tokens-videos/SKILL.md](tokens-videos/SKILL.md) before editing a composition.
2. Use the `hyperframes` skill and CLI for all linting, validation, preview, and renders.
3. For Trending Assets, run `tokens-videos/templates/trending-assets/render-trending-assets.mjs`. It fetches only `category === "equity"` assets from the Tokens API, generates an ElevenLabs instrumental, and renders a dated MP4.
4. Copy `tokens-videos/env.example` to `env` at the repository root, then add `TOKENS_XYZ_API_KEY` and `ELEVENLABS_API_KEY` locally. Never commit `env` files or print keys.
5. Keep generated renders, browser caches, and preview artefacts out of commits. Commit source, templates, approved assets, and deterministic data snapshots only.
6. Before handing off a video, run `npx hyperframes lint`, `npx hyperframes validate`, and inspect representative frames from the final MP4.

Useful starting points:

- `tokens-videos/templates/trending-assets/`: stock-only data-driven daily post.
- `tokens-videos/templates/breaking-ath/`: landscape metric or milestone post.
- `tokens-videos/templates/breaking-ath-square/`: square metric or milestone post.
- `tokens-videos/projects/equities-50m-24h-volume/`: completed $50M tokenized-equities milestone example.
