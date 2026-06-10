# Tokens News Sourcing Plan Audit

Date: 2026-06-08

Source package reviewed: `/Users/nicholas/Documents/Tokens/review-2026-06-08`

End goal: 98% of news surfaced into Slack should become X/Twitter posts because the system found highly relevant news quickly enough.

## Executive Verdict

The package is a strong editorial/style study and a useful first scoring rubric. It is not yet a complete implementation plan for the 98% Slack-to-X goal.

I would not build the plan exactly as written. I would keep the account thesis, asset inventory, copy rules, and 0-10 score, but wrap them in hard gates:

1. Trusted source gate
2. Freshness/latency gate
3. Asset or thesis relevance gate
4. Verification gate
5. Dedupe/novelty gate
6. Draftable post gate

Only candidates that pass those gates should enter the main Slack channel. Everything else should go to research, monitoring, or roundup.

## What Already Exists

The package already has useful foundations:

- Asset universe: 304 assets, including 219 stocks, 24 ETFs, 30 crypto majors, 15 stablecoins, 15 RWAs, and 4 commodities.
- Editorial thesis: the account is a market-news filter for tokenized assets, not a generic crypto account.
- Priority lanes: AI/chips/data centers, tokenized market structure, mega-cap catalysts, macro/rates/policy, crypto/RWA/legal, commodities.
- Copy model: market-wire headline plus optional Solana/tokenized asset bridge.
- Ranking model: asset relevance, market movement potential, specificity/data, timeliness, platform thesis fit.

The strongest line in the plan is the hidden editorial question:

> Does this event change how people think about an asset that can be traded on Solana, or the market structure around tokenized assets?

That is the correct north star.

## Sub-Agent Debate Summary

### Defender Position

The package is close enough for v1 if "surfaced" means only high-confidence, high-score items. Do not overbuild a complex ML ranker. Use the current rubric, surface only 8-10s, and tune aliases/thresholds from a daily review log.

Useful defender point: precision beats coverage. The system should aggressively hide mediocre items rather than send lots of caveated Slack alerts.

### Attacker Position

The current plan will miss the 98% target because it has no hard gates, no source strategy, no rejected-candidate dataset, no dedupe, and weak entity matching. A 6-7 item "if fresh" is too soft for a Slack channel where nearly everything should be postable.

Useful attacker point: the 100-post dataset only shows positives. It cannot calibrate false positives because it does not include candidates the team rejected.

### Speed/Source Position

The package is good at editorial fit and weak at source architecture. The fastest practical path is not generic news search. It is parallel ingestion from curated X sources, official/SEC/IR/RSS sources, market movers, and Solana/RWA ecosystem data.

Useful source point: X should be treated as a detector unless the source is official or independently confirmed.

### Editorial Ops Position

The package does not yet define the production Slack workflow. Each surfaced item needs source confidence, asset confidence, draft copy, dedupe status, approval state, post URL, rejection reason, and performance outcome.

Useful ops point: 98% should apply to the qualified green queue, not every raw candidate the system sees.

## Key Findings

### P0 - The Rubric Is Too Soft For 98% Precision

The plan recommends:

- 8-10: post immediately
- 6-7: post if fresh or especially clean
- 4-5: save for roundup

For a 98% Slack-to-X conversion goal, the main Slack channel cannot receive 6-7 "maybe" items. Those belong in a separate research or maybe channel.

Recommendation:

- Main Slack green queue: hard-gated 8-10 only.
- Research queue: strong but unverified items.
- Roundup queue: non-urgent 6-7 items.
- Monitoring queue: weak but strategically interesting items.

### P0 - Source Strategy Is Missing

The package defines what news fits, but not where the system should source it fastest.

Recommended source tiers:

| Tier | Sources | Slack treatment |
|---|---|---|
| A | Official company/project accounts, company newsrooms, IR feeds, SEC EDGAR, economic calendar, onchain/RWA metrics | Can enter green queue if asset/thesis fit passes |
| B | Trusted wires, market reporters, financial-news APIs | Can enter green queue if verified or highly trusted |
| C | Aggregators, influencer posts, screenshots, rumors | Research only until confirmed |

### P0 - Asset Matching Needs Disambiguation

The data already shows matcher risk:

- `OPEN` can match "Market open" or "open AI model."
- `CHIP` can match the phrase "chip trade."
- `NOW` can match ordinary "now."
- `MEGA` can match "mega IPO."
- `Target`, `CASH`, `ON`, and `ULTRA` are also ambiguous.

Recommendation:

Build an entity resolver, not a ticker substring matcher. Each asset should have:

- Canonical name
- Cashtag
- Official handle
- Known aliases
- Parent/supplier/customer links
- SEC CIK where relevant
- Newsroom/IR URLs
- Ambiguous-symbol rules
- Bridge-line permission
- Asset tier

### P1 - Positive-Only Training Data Cannot Calibrate Precision

The dataset is the latest 100 published posts over roughly four days. That proves what the account posted. It does not show:

- What candidates were rejected
- Which Slack alerts were ignored
- Which good stories were missed
- Which sources were fastest
- Which source types caused false positives

Recommendation:

Create a candidate eval table immediately:

```text
candidate_id
first_seen_at
source_published_at
source_type
source_url
matched_assets
score_breakdown
hard_gate_results
slack_queue
decision: posted | rejected | duplicate | stale | unverifiable | too_soft
rejection_reason
x_post_url
latency_minutes
performance_metrics
```

Measure:

- Precision at green Slack queue
- Median time from source publish to Slack
- Median time from Slack to post
- False positive reasons
- Missed-story reasons

### P1 - Freshness Is Underweighted

The current rubric gives timeliness only 0-1 point. But speed is part of the core goal.

Recommendation:

Use category-specific TTLs:

| Category | Green-queue TTL |
|---|---:|
| Breaking macro/geopolitical/rates | 5-15 minutes |
| Public-company catalyst | 15-45 minutes |
| Tokenized market-structure launch/integration | 30-180 minutes |
| Onchain/RWA metric milestone | 1-6 hours |
| Evergreen insight | Roundup only |

### P1 - Link-Only X Rows Need Thread Reconstruction

The analysis shows `https` as the top hook label with 17 rows. Those are likely source/media/reply artifacts, not standalone post templates.

Recommendation:

When ingesting X:

- Expand `t.co` URLs.
- Fetch parent/quoted/replied-to context.
- Attach link-only posts as evidence to an event cluster.
- Exclude link-only artifacts from style/ranking positives.

### P1 - Slack Needs To Carry Decisions, Not Just Headlines

Each card should answer: "Can I approve this right now?"

Minimum Slack card fields:

```json
{
  "candidate_id": "string",
  "priority": "P0_POST_NOW | P1_VERIFY | P2_ROUNDUP",
  "status": "new | needs_source | drafted | approved | posted | rejected",
  "headline": "string",
  "source": {
    "canonical_url": "string",
    "publisher": "string",
    "source_type": "official | sec | wire | reporter | aggregator | social",
    "published_at": "datetime",
    "first_seen_at": "datetime",
    "age_minutes": 0,
    "source_confidence": 0.0
  },
  "asset_mapping": [
    {
      "asset_id": "string",
      "symbol": "string",
      "match_type": "direct | parent | supplier | customer | macro | thesis",
      "match_confidence": 0.0,
      "bridge_allowed": true
    }
  ],
  "score": {
    "total": 0,
    "asset_relevance": 0,
    "market_movement": 0,
    "specificity": 0,
    "timeliness": 0,
    "platform_thesis_fit": 0,
    "source_trust": 0,
    "novelty": 0
  },
  "hard_gates": {
    "trusted_source": true,
    "fresh": true,
    "verified": true,
    "non_duplicate": true,
    "clear_asset_or_thesis_link": true,
    "draftable": true
  },
  "why_post": "string",
  "risk_notes": "string",
  "draft_copy": "string",
  "dedupe_cluster_id": "string",
  "actions": ["Approve", "Needs source", "Rewrite", "Skip"]
}
```

## Recommended Implementation

### Target Data Flow

```text
source registry
  -> parallel ingestion
  -> URL expansion + source normalization
  -> event clustering + dedupe
  -> entity/asset resolver
  -> hard gates
  -> editorial score
  -> draft generation
  -> Slack green/research/roundup queues
  -> approval/post/reject
  -> feedback and threshold tuning
```

### Source Registry

Start from `tokens-assets-flat.csv`, then enrich it.

For each asset:

- `asset_id`
- `name`
- `symbol`
- `category`
- `asset_tier`
- `official_x_handle`
- `company_site`
- `newsroom_rss`
- `ir_rss`
- `sec_cik`
- `known_aliases`
- `ambiguous_terms`
- `related_entities`
- `bridge_allowed`

For non-asset thesis sources:

- Solana
- Raydium
- Jupiter
- Phantom
- xStocks
- Ondo
- Securitize
- BlackRock tokenized funds
- RWA.xyz-like metrics sources
- Stablecoin/fund/tokenized-equity holder and volume dashboards

### Ingestion Layers

1. X real-time detector
   - Curated official handles, trusted reporters, and Solana/RWA ecosystem accounts.
   - Use X stream rules where access allows.
   - Treat non-official X as detector, not final verification.

2. Official confirmation layer
   - Company newsrooms
   - IR feeds
   - SEC EDGAR submissions
   - Official project blogs

3. Market movement layer
   - Equity/ETF/crypto price and volume anomalies
   - Tokenized asset volume/liquidity movement
   - Onchain holder/volume milestones

4. Financial news API layer
   - Ticker-filtered headlines for the asset universe
   - Topic filters for AI/chips/data centers, macro, tokenization, RWA, regulation

### Slack Queues

Use separate channels or sections:

- `P0_POST_NOW`: publishable, verified, fresh, draft included.
- `P1_VERIFY`: probably good, needs confirmation or better source.
- `P2_ROUNDUP`: good context but not urgent.
- `MONITORING`: interesting but not Slack-to-X conversion measured.

The 98% metric should apply only to `P0_POST_NOW`.

## What Not To Build First

- Do not start with a complex ML ranker.
- Do not build broad generic news search before source tiers.
- Do not let direct ticker matches alone trigger Slack.
- Do not send 6-7 score items into the measured Slack channel.
- Do not optimize engagement prediction before source/precision/freshness instrumentation.
- Do not auto-post until the eval table shows stable precision.

## External Source Checks

These current official docs support the recommended architecture:

- X Filtered Stream: near-real-time posts matching rules, with documented P99 latency around seconds. https://docs.x.com/x-api/posts/filtered-stream/introduction
- X Powerstream: lower-latency premium real-time public X data option. https://docs.x.com/x-api/powerstream/introduction
- SEC EDGAR APIs: submissions JSON updates in real time as submissions are disseminated, with typical processing delay under a second for submissions. https://www.sec.gov/edgar/sec-api-documentation
- SEC structured disclosure RSS: feeds update every ten minutes on weekdays, 6am-10pm Eastern. https://www.sec.gov/structureddata/rss-feeds
- Slack `chat.postMessage`: supports structured messages and has per-channel rate guidance. https://api.slack.com/methods/chat.postMessage
- Slack Block Kit: supports interactive card layouts with buttons and fields. https://api.slack.com/reference/block-kit

## Final Recommendation

Build a v1, but change the plan before implementation:

1. Keep the editorial rubric.
2. Add source tiers and hard publishability gates.
3. Enrich the asset map into an entity/source registry.
4. Build event clustering/dedupe before Slack posting.
5. Split Slack into green, verify, roundup, and monitoring queues.
6. Measure the green queue against the 98% goal.
7. Tune with rejected candidates, not only historical posts.

The best path is an asset-first, source-trusted, hard-gated Slack system. The current package gives the voice and relevance logic. It does not yet give the production machinery required to make almost every Slack item post-worthy.
