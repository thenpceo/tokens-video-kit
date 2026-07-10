# Tokens Video Kit

This repository packages the reusable Tokens HyperFrames video system. Install the root skill, then use the agent guide and the `tokens-videos/` package to create, refresh, validate, and render Tokens videos.

## Give This To An Agent

Give the agent the repository URL plus `TOKENS_XYZ_API_KEY` and `ELEVENLABS_API_KEY`, then ask it to read [SETUP.md](SETUP.md) and [AGENTS.md](AGENTS.md). No credentials are stored in the repository.

For a local checkout, the complete bootstrap is:

```bash
git clone https://github.com/thenpceo/tokens-video-kit.git
cd tokens-video-kit
bash scripts/bootstrap-video-kit.sh
cp tokens-videos/env.example env
```

After adding the two API keys to `env`, the agent can run the full non-crypto, non-stablecoin Trending Assets video workflow:

```bash
cd tokens-videos/templates/trending-assets
node render-trending-assets.mjs
```

Start with [AGENTS.md](AGENTS.md), then read [tokens-videos/SKILL.md](tokens-videos/SKILL.md). The included templates cover milestone announcements and the repeatable Trending Assets workflow, which ranks the curated universe while excluding crypto and stablecoins.

Credentials are intentionally not included. Copy `tokens-videos/env.example` to `env` at the repository root and add the required API keys locally.
