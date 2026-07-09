# Tokenized Equities — $50M in 24H

Square 1080×1080 milestone video for the Tokens feed. It uses the approved Tokens 3D-logo, chart, count-up, transition, and SFX system from the `breaking-ath-square` template, rethemed for a rolling 24-hour volume milestone.

Claim: **Tokenized equities crossed $50M in aggregate 24-hour volume.**

The snapshot used for this render was captured on July 9, 2026 at 20:22 UTC from `GET https://api.tokens.xyz/v1/assets/curated?list=all&groupBy=asset&limit=500`: 392 assets where `category === "equity"` summed to `$50,962,991.77` in `stats.volume24hUSD`. The copy deliberately says “$50M in 24H” rather than asserting an all-time record, because the current API has no platform-wide historical aggregate endpoint.

Render:

```bash
npx hyperframes lint
npx hyperframes validate
npx hyperframes render --variables-file variables.json --output renders/equities-50m-24h-volume.mp4
```
