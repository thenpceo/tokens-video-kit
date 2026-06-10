import type Database from 'better-sqlite3';
import { nowUtc } from '../db/db.js';

export type ScoreWindow = '24h' | '7d' | '30d';

const WINDOW_HOURS: Record<ScoreWindow, number> = { '24h': 24, '7d': 168, '30d': 720 };

export interface SourceScoreRow {
  sourceId: string;
  window: ScoreWindow;
  inputs: Record<string, number>;
  qualityScore: number | null;
  state: 'insufficient_data' | 'boost' | 'maintain' | 'demote' | 'removal_review';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute the v1 quality score for one source over a window, per the plan:
 * positive = post_worthy*3 + posted*3 + useful
 * negative = who_cares*2 + wrong_fit*2 + bad_source*3 + stale + duplicate
 * quality  = clamp(50 + positive*5 - negative*5 + bonuses, 0, 100)
 */
export function computeSourceScore(
  db: Database.Database,
  sourceId: string,
  window: ScoreWindow,
  now = new Date(),
): SourceScoreRow {
  const since = new Date(now.getTime() - WINDOW_HOURS[window] * 3600_000).toISOString();

  const labelCounts = db.prepare(`
    SELECT fv.label AS label, COUNT(*) AS n
    FROM feedback_votes fv
    JOIN normalized_candidates nc ON nc.id = fv.candidate_id
    WHERE nc.source_id = ? AND fv.created_at >= ?
    GROUP BY fv.label
  `).all(sourceId, since) as Array<{ label: string; n: number }>;

  const counts: Record<string, number> = {};
  for (const r of labelCounts) counts[`${r.label}_count`] = r.n;

  const posted = db.prepare(`
    SELECT COUNT(*) AS n FROM posted_links pl
    JOIN normalized_candidates nc ON nc.id = pl.candidate_id
    WHERE nc.source_id = ? AND pl.posted_at >= ?
  `).get(sourceId, since) as { n: number };

  const queueCounts = db.prepare(`
    SELECT queue, COUNT(*) AS n FROM normalized_candidates
    WHERE source_id = ? AND created_at >= ? GROUP BY queue
  `).all(sourceId, since) as Array<{ queue: string; n: number }>;

  const inputs = {
    post_worthy_count: counts['post_worthy_count'] ?? 0,
    useful_count: counts['useful_count'] ?? 0,
    who_cares_count: counts['who_cares_count'] ?? 0,
    duplicate_count: counts['duplicate_count'] ?? 0,
    stale_count: counts['stale_count'] ?? 0,
    bad_source_count: counts['bad_source_count'] ?? 0,
    wrong_fit_count: counts['wrong_fit_count'] ?? 0,
    posted_count: posted.n,
    p0_candidate_count: queueCounts.find((q) => q.queue === 'P0_POST_NOW')?.n ?? 0,
    p1_candidate_count: queueCounts.find((q) => q.queue === 'P1_VERIFY')?.n ?? 0,
  } satisfies Record<string, number>;

  const ratedCount =
    inputs.post_worthy_count + inputs.useful_count + inputs.who_cares_count +
    inputs.duplicate_count + inputs.stale_count + inputs.bad_source_count + inputs.wrong_fit_count;

  if (ratedCount < 10) {
    return { sourceId, window, inputs, qualityScore: null, state: 'insufficient_data' };
  }

  const positive = inputs.post_worthy_count * 3 + inputs.posted_count * 3 + inputs.useful_count;
  const negative =
    inputs.who_cares_count * 2 + inputs.wrong_fit_count * 2 + inputs.bad_source_count * 3 +
    inputs.stale_count + inputs.duplicate_count;
  const quality = clamp(50 + positive * 5 - negative * 5, 0, 100);

  let state: SourceScoreRow['state'];
  if (quality >= 75) state = 'boost';
  else if (quality >= 45) state = 'maintain';
  else if (quality < 30 && ratedCount >= 20) state = 'removal_review';
  else state = 'demote';

  return { sourceId, window, inputs, qualityScore: quality, state };
}

export function persistSourceScores(db: Database.Database, sourceIds: string[]): SourceScoreRow[] {
  const out: SourceScoreRow[] = [];
  const stamp = nowUtc();
  for (const sourceId of sourceIds) {
    for (const window of ['24h', '7d', '30d'] as ScoreWindow[]) {
      const row = computeSourceScore(db, sourceId, window);
      db.prepare(`
        INSERT OR IGNORE INTO source_scores (source_id, window, computed_at, inputs, quality_score, state)
        VALUES (?,?,?,?,?,?)
      `).run(sourceId, window, stamp, JSON.stringify(row.inputs), row.qualityScore, row.state);
      out.push(row);
    }
  }
  return out;
}
