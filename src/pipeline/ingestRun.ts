import type Database from 'better-sqlite3';
import { getEnv } from '../config/env.js';
import { nowUtc } from '../db/db.js';
import { fetchWithHealth, recordHealth } from '../ingest/http.js';
import { parseFeed } from '../ingest/rss.js';
import { fetchSecFilings } from '../ingest/sec.js';
import { fetchCryptoPanic } from '../ingest/cryptopanic.js';
import { fetchXTimeline } from '../ingest/x.js';
import {
  loadSourceRegistry, pollableSources, type PollableSource, type SourceRegistry,
} from '../registry/loadSourceRegistry.js';
import { evaluateCandidate } from './evaluate.js';
import { hasActiveCluster, storeCandidate, storeRawEvent } from './persist.js';
import { draftCopy } from './draft.js';
import { renderCandidateCard } from '../slack/card.js';
import { postToSlack } from '../slack/post.js';
import type { CandidateInput } from './types.js';

export interface IngestStats {
  sourcesPolled: number;
  itemsSeen: number;
  candidatesStored: number;
  byQueue: Record<string, number>;
  slackPosted: number;
  errors: string[];
}

/** Sources due for polling based on per-source interval and last poll time. */
export function dueSources(db: Database.Database, sources: PollableSource[], now = new Date()): PollableSource[] {
  return sources.filter((s) => {
    const row = db
      .prepare('SELECT last_polled_at, backoff_until FROM source_poll_state WHERE source_id = ?')
      .get(s.sourceId) as { last_polled_at: string | null; backoff_until: string | null } | undefined;
    if (row?.backoff_until && new Date(row.backoff_until) > now) return false;
    if (!row?.last_polled_at) return true;
    const ageMin = (now.getTime() - new Date(row.last_polled_at).getTime()) / 60_000;
    return ageMin >= s.pollIntervalMinutes;
  });
}

async function processCandidate(
  db: Database.Database,
  registry: SourceRegistry,
  input: CandidateInput,
  payload: unknown,
  httpStatus: number | null,
  hash: string | null,
  stats: IngestStats,
  options: { postToSlack: boolean },
): Promise<void> {
  stats.itemsSeen++;
  const rawId = storeRawEvent(db, input, payload, httpStatus, hash);
  if (rawId === null) return; // already ingested

  const decision = evaluateCandidate(input, registry, {
    isDuplicate: (key) => hasActiveCluster(db, key),
  });
  const stored = storeCandidate(db, input, decision, rawId);
  if (!stored) return;

  stats.candidatesStored++;
  stats.byQueue[decision.queue] = (stats.byQueue[decision.queue] ?? 0) + 1;

  if (
    options.postToSlack &&
    (decision.queue === 'P0_POST_NOW' || decision.queue === 'P1_VERIFY')
  ) {
    const draft = await draftCopy(input, decision);
    db.prepare("UPDATE normalized_candidates SET draft_copy = ?, status = 'sent' WHERE id = ?")
      .run(draft, stored.candidateId);
    const env = getEnv();
    const interactive = Boolean(env.SLACK_BOT_TOKEN && env.SLACK_SIGNING_SECRET);
    const card = renderCandidateCard(stored.candidateId, input, decision, draft, interactive);
    const channel = decision.queue === 'P1_VERIFY' ? env.SLACK_VERIFY_CHANNEL_ID : env.SLACK_POST_CHANNEL_ID;
    const res = await postToSlack(db, stored.candidateId, card, channel);
    if (res.ok) stats.slackPosted++;
    else if (res.error) stats.errors.push(`slack: ${res.error}`);
  }
}

export async function runIngestOnce(
  db: Database.Database,
  opts: { postToSlack?: boolean; onlyDue?: boolean; maxSources?: number } = {},
): Promise<IngestStats> {
  const env = getEnv();
  const registry = loadSourceRegistry();
  const all = pollableSources(registry);
  const xEnabled = Boolean(env.X_BEARER_TOKEN || env.TWITTERAPI_IO_KEY);

  const stats: IngestStats = {
    sourcesPolled: 0, itemsSeen: 0, candidatesStored: 0, byQueue: {}, slackPosted: 0, errors: [],
  };

  let pollable = all.filter(
    (s) => s.kind === 'rss' || s.kind === 'sec_api' || (s.kind === 'x' && xEnabled),
  );
  if (!xEnabled) {
    // Explicit degraded mode: X sources exist but are not polled.
    recordHealth(db, 'x-ingestion', 'quiet_period', undefined, 'x_ingestion_disabled');
  }
  if (opts.onlyDue !== false) pollable = dueSources(db, pollable);
  if (opts.maxSources) pollable = pollable.slice(0, opts.maxSources);

  const post = opts.postToSlack ?? true;

  for (const source of pollable) {
    stats.sourcesPolled++;
    try {
      if (source.kind === 'rss' && source.url) {
        const res = await fetchWithHealth(db, source.sourceId, source.url, {
          'User-Agent': env.SEC_USER_AGENT,
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        });
        if (!res.ok) continue;
        let items;
        try {
          items = parseFeed(res.body);
        } catch (err) {
          recordHealth(db, source.sourceId, 'parse_failed', res.status, err instanceof Error ? err.message : String(err));
          continue;
        }
        for (const item of items.slice(0, 20)) {
          await processCandidate(db, registry, {
            sourceId: source.sourceId,
            sourceName: source.name,
            sourceTier: source.tier,
            sourceRoute: source.route,
            sourceType: 'rss',
            headline: item.title,
            body: item.description,
            url: item.link,
            canonicalUrl: item.link,
            publishedAt: item.publishedAt,
            firstSeenAt: nowUtc(),
            assetSymbolHint: source.assetSymbol,
          }, item, res.status, res.hash, stats, { postToSlack: post });
        }
      } else if (source.kind === 'x' && source.xHandle && xEnabled) {
        const tweets = await fetchXTimeline(db, source.sourceId, {
          twitterApiIoKey: env.TWITTERAPI_IO_KEY,
          bearerToken: env.X_BEARER_TOKEN,
        }, source.xHandle);
        for (const tweet of tweets.slice(0, 10)) {
          if (tweet.isReply) continue; // thread context is best-effort in v1
          await processCandidate(db, registry, {
            sourceId: source.sourceId,
            sourceName: source.name,
            sourceTier: source.tier,
            sourceRoute: source.route,
            sourceType: 'x',
            headline: tweet.text.slice(0, 280),
            url: tweet.url,
            canonicalUrl: tweet.url,
            publishedAt: tweet.createdAt,
            firstSeenAt: nowUtc(),
            assetSymbolHint: source.assetSymbol,
            clusterKeyHint: undefined,
          }, tweet, 200, null, stats, { postToSlack: post });
        }
      } else if (source.kind === 'sec_api' && source.cik) {
        const filings = await fetchSecFilings(db, source.sourceId, source.cik, source.name.replace(' SEC filings', ''));
        for (const filing of filings) {
          await processCandidate(db, registry, {
            sourceId: source.sourceId,
            sourceName: source.name,
            sourceTier: 'A',
            sourceRoute: source.route,
            sourceType: 'sec_api',
            headline: filing.title,
            body: filing.primaryDocDescription,
            url: filing.url,
            canonicalUrl: filing.url,
            publishedAt: new Date(`${filing.filingDate}T12:00:00Z`).toISOString(),
            firstSeenAt: nowUtc(),
            assetSymbolHint: source.assetSymbol,
            clusterKeyHint: filing.accessionNumber,
          }, filing, 200, null, stats, { postToSlack: post });
        }
      }
      db.prepare(`
        INSERT INTO source_poll_state (source_id, last_polled_at) VALUES (?, ?)
        ON CONFLICT(source_id) DO UPDATE SET last_polled_at = excluded.last_polled_at
      `).run(source.sourceId, nowUtc());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`${source.sourceId}: ${msg}`);
      recordHealth(db, source.sourceId, 'http_error', undefined, msg);
    }
  }

  // CryptoPanic fast detector (tier C, p1_verify route at best).
  if (env.CRYPTOPANIC_API_KEY) {
    try {
      const items = await fetchCryptoPanic(db, env.CRYPTOPANIC_API_KEY);
      for (const item of items.slice(0, 30)) {
        await processCandidate(db, registry, {
          sourceId: 'cryptopanic-detector',
          sourceName: `CryptoPanic${item.sourceDomain ? ` (${item.sourceDomain})` : ''}`,
          sourceTier: 'C',
          sourceRoute: 'p1_verify',
          sourceType: 'detector_api',
          headline: item.title,
          url: item.url,
          canonicalUrl: item.url,
          publishedAt: item.publishedAt,
          firstSeenAt: nowUtc(),
        }, item, 200, null, stats, { postToSlack: post });
      }
      stats.sourcesPolled++;
    } catch (err) {
      stats.errors.push(`cryptopanic: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return stats;
}
