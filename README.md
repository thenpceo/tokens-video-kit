# Tokens Postability Engine

Registry-driven news sourcing for the @tokens X account: ingest → hard gates →
editorial score → Slack queues → human feedback → source scoring. Plan:
[2026-06-10-tokens-postability-engine.md](2026-06-10-tokens-postability-engine.md).

## Quick start

```bash
npm install
npm run migrate          # apply SQLite migrations (data/tokens-postability.sqlite)
npm test                 # vitest suite
npm run ingest:once -- --no-slack   # one ingestion pass, dry run
npm run ingest:once      # one pass, posting P0/P1 cards to Slack
npm run worker           # long-running: scheduler + health/Slack-action server
```

Secrets load from `env` / `env.local` (or `.env` / `.env.local`) in the project
root. See `src/config/env.ts` for the full schema — everything is optional and
missing keys put connectors in an explicit degraded state (visible at
`GET /healthz` and in worker startup logs).

## What runs today

- **RSS/Atom** company, IR, and ecosystem feeds from `config/source-registry.json`
- **SEC EDGAR** submissions API per mapped CIK (material forms only)
- **X ingestion** via twitterapi.io (`TWITTERAPI_IO_KEY`) for all registry handles
- **Slack cards** via incoming webhook (`SLACK_WEBHOOK_URL`); interactive
  feedback buttons activate automatically once `SLACK_BOT_TOKEN` +
  `SLACK_SIGNING_SECRET` exist (create a Slack app, point interactivity at
  `POST /slack/actions`)
- **Draft copy** via Anthropic (`TOKENS_ANTHROPIC_API_KEY`), template fallback
- **Decision traces** for every candidate: gates, score breakdown, TTL,
  dedupe, routing reason codes
- **Source health** separate from source quality; failures backoff
  exponentially and are recorded as health events

## Queues

`P0_POST_NOW` (all six gates pass, score 8–10) · `P1_VERIFY` · `P2_ROUNDUP` ·
`MONITORING` · `REJECTED`. Every non-P0 item carries machine reason codes.

## Operational CLIs

```bash
npx tsx src/cli/postCandidate.ts <id>      # (re)send a candidate card to Slack
npx tsx src/cli/missedStory.ts "<url|headline>" ["why it mattered"]
npm run report:sources                     # per-source quality/health summary
```

## Deploy

`render.yaml` defines the Render web service with a persistent disk at
`/var/data`. Set the secret env vars in the dashboard. The worker runs
migrations before the first scheduler tick; `/readyz` stays unhealthy until
migrations and registry validation pass.

## Known gaps (need Nicholas)

1. **Slack app**: webhook can post cards but buttons need a Slack app
   (bot token + signing secret + interactivity URL). Until then feedback is
   collected via the CLI/threads, not buttons.
2. **CryptoPanic key returns 404** on every API version — plan lapsed or key
   expired. Connector is built and will activate when the key works.
3. **Some registry "RSS" URLs are HTML pages** (e.g. NVIDIA newsroom). They are
   flagged as `parse_failed` health events; registry URLs need curation.
