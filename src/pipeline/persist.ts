import type Database from 'better-sqlite3';
import { nowUtc } from '../db/db.js';
import { canonicalizeUrl } from './cluster.js';
import type { CandidateInput, RoutingDecision } from './types.js';

export interface StoredCandidate {
  candidateId: number;
  clusterId: number;
  isNew: boolean;
}

/** True when an active cluster already covers this key. */
export function hasActiveCluster(db: Database.Database, key: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM event_clusters WHERE cluster_key = ? AND status = 'active'").get(key),
  );
}

export function storeRawEvent(
  db: Database.Database,
  input: CandidateInput,
  payload: unknown,
  httpStatus: number | null,
  responseHash: string | null,
): number | null {
  const canonical = canonicalizeUrl(input.canonicalUrl ?? input.url) ?? null;
  try {
    const res = db.prepare(`
      INSERT INTO raw_ingest_events (source_id, source_type, fetched_at, published_at, http_status, response_hash, parse_status, payload, canonical_url)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      input.sourceId, input.sourceType, input.firstSeenAt, input.publishedAt ?? null,
      httpStatus, responseHash, 'ok', JSON.stringify(payload), canonical,
    );
    return Number(res.lastInsertRowid);
  } catch (err) {
    // UNIQUE(source_id, canonical_url) — already ingested this item.
    if (err instanceof Error && err.message.includes('UNIQUE')) return null;
    throw err;
  }
}

/**
 * Persist a candidate, its cluster link, and full decision trace.
 * Returns null when the canonical URL was already stored (exact duplicate).
 */
export function storeCandidate(
  db: Database.Database,
  input: CandidateInput,
  decision: RoutingDecision,
  rawEventId: number | null,
): StoredCandidate | null {
  const canonical = canonicalizeUrl(input.canonicalUrl ?? input.url) ?? null;

  const tx = db.transaction((): StoredCandidate | null => {
    let cluster = db
      .prepare('SELECT id FROM event_clusters WHERE cluster_key = ?')
      .get(decision.clusterKey) as { id: number } | undefined;
    if (cluster) {
      db.prepare('UPDATE event_clusters SET last_seen_at = ? WHERE id = ?').run(nowUtc(), cluster.id);
    } else {
      const res = db.prepare(
        'INSERT INTO event_clusters (cluster_key, first_seen_at, last_seen_at, headline) VALUES (?,?,?,?)',
      ).run(decision.clusterKey, input.firstSeenAt, input.firstSeenAt, input.headline);
      cluster = { id: Number(res.lastInsertRowid) };
    }

    let candidateId: number;
    try {
      const res = db.prepare(`
        INSERT INTO normalized_candidates
          (raw_event_id, cluster_id, source_id, source_tier, source_route, headline, body, url, canonical_url,
           published_at, first_seen_at, category, matched_assets, queue, reason_codes, editorial_score, score_breakdown, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new')
      `).run(
        rawEventId, cluster.id, input.sourceId, input.sourceTier, input.sourceRoute,
        input.headline, input.body ?? null, input.url ?? null, canonical,
        input.publishedAt ?? null, input.firstSeenAt, decision.ttl.category,
        JSON.stringify(decision.matchedAssets), decision.queue,
        JSON.stringify(decision.reasonCodes), decision.score.total,
        JSON.stringify(decision.score),
      );
      candidateId = Number(res.lastInsertRowid);
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) return null;
      throw err;
    }

    db.prepare(`
      INSERT INTO decision_traces (candidate_id, gate_results, score_breakdown, matched_entities, ttl_decision, dedupe_result, routing_result)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      candidateId,
      JSON.stringify(decision.gateResults),
      JSON.stringify(decision.score),
      JSON.stringify(decision.matchedAssets),
      JSON.stringify(decision.ttl),
      JSON.stringify({ cluster_key: decision.clusterKey, duplicate: decision.duplicate }),
      JSON.stringify({ queue: decision.queue, reasons: decision.reasonCodes }),
    );

    return { candidateId, clusterId: cluster.id, isNew: true };
  });

  return tx();
}
