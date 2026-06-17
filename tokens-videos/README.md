# tokens-videos

A packaged agent **skill** for making on-brand [Tokens](https://www.tokens.xyz) motion videos with [HyperFrames](https://hyperframes.heygen.com). Hand it to a teammate and their agent can instantly retheme the "Breaking ATH" template or build a new video that feels like the same family.

It bundles the Tokens **video brand system**, reusable **assets** (3D logo, wordmark, token cubes, SFX), and a ready-to-render **parameterized template**. `SKILL.md` is the agent entry point.

## What's inside

```
tokens-videos/
├── SKILL.md                 # agent entry point (brand-at-a-glance + routing)
├── references/              # brand.md, templates.md, audio.md, build-and-render.md
├── assets/                  # logo.svg, wordmark.svg, cubes/, sfx/, design.md
└── templates/
    ├── breaking-ath/        # self-contained HyperFrames project (retheme via variables)
    └── trending-assets/     # cron-ready Tokens API + ElevenLabs + HyperFrames render flow
```

## Requirements

- **Node.js 22+** and **FFmpeg** on PATH.
- The **`hyperframes`** skill — this skill builds on it. Install it too:
  ```bash
  npx skills add heygen-com/hyperframes
  ```

## Install

**Option A — `skills` CLI (recommended, same as hyperframes).** Put this folder in a git repo and:
```bash
npx skills add <your-org>/<your-repo>      # installs into ~/.agents/skills, symlinked per agent
```

**Option B — local, Claude Code.** Copy the folder into your skills dir:
```bash
cp -r tokens-videos ~/.claude/skills/tokens-videos      # user-global
# or  ./.claude/skills/tokens-videos                    # project-local
```

Restart the agent session so it picks up the new skill.

## Use

Once installed, just ask the agent, e.g.:
- *"Make a Tokens new-record-high video — volume hit $250M."*  → reskins `breaking-ath` via variables.
- *"Quick Tokens ATH clip for tokenized treasuries, $1.2B."*
- *"Build a new Tokens promo for our staking launch, same style."* → Path B, new composition on the brand system.

Or drive the template directly:
```bash
cp -r tokens-videos/templates/breaking-ath my-video && cd my-video
npx hyperframes render --variables '{"stat_value":250,"scene3_heading":"Tokenized Equities"}' --output my-video.mp4
```

Cron-ready trending-assets flow:
```bash
cd tokens-videos/templates/trending-assets
node render-trending-assets.mjs
```

This refreshes 24h trending assets from the Tokens API, generates a beat-forward ElevenLabs instrumental, applies the Tokens design choices, validates, and renders a timestamped MP4.

## Notes

- **SFX** are synthesized and bundled (royalty-free). The **music bed is not** — templates ship a generic synthesized default; swap in a licensed track and credit the artist before publishing (see `references/audio.md`).
- Keep new official assets (cube art, etc.) in this kit so every Tokens video stays consistent.
