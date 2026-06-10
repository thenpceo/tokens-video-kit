import { getDb } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';
import { computeSourceScore } from '../scoring/sourceScores.js';

const db = getDb();
runMigrations(db);

const sources = db.prepare(`
  SELECT source_id, COUNT(*) AS candidates FROM normalized_candidates GROUP BY source_id ORDER BY candidates DESC
`).all() as Array<{ source_id: string; candidates: number }>;

console.log('source_id | candidates | 7d score | state | health');
for (const s of sources) {
  const score = computeSourceScore(db, s.source_id, '7d');
  const health = db.prepare(
    'SELECT consecutive_failures, last_success_at FROM source_health_state WHERE source_id = ?',
  ).get(s.source_id) as { consecutive_failures: number; last_success_at: string | null } | undefined;
  console.log(
    `${s.source_id} | ${s.candidates} | ${score.qualityScore ?? '-'} | ${score.state} | ` +
    `${health ? `fails=${health.consecutive_failures} lastOk=${health.last_success_at ?? 'never'}` : 'no polls'}`,
  );
}
