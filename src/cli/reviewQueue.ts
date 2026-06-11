import { getDb } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';

/**
 * Review what would have been posted to Slack, without Slack.
 * Usage: npm run review:queue [-- hours] (default 24)
 */
const hours = Number(process.argv[2]) || 24;
const db = getDb();
runMigrations(db);

const since = new Date(Date.now() - hours * 3600_000).toISOString();
const rows = db.prepare(`
  SELECT id, source_id, queue, editorial_score, reason_codes, headline, url, published_at, created_at
  FROM normalized_candidates
  WHERE created_at > ? AND queue IN ('P0_POST_NOW', 'P1_VERIFY')
  ORDER BY queue, editorial_score DESC, id DESC
`).all(since) as any[];

console.log(`P0/P1 candidates from the last ${hours}h (${rows.length} total)\n`);
let lastQueue = '';
for (const r of rows) {
  if (r.queue !== lastQueue) {
    console.log(`\n========== ${r.queue} ==========`);
    lastQueue = r.queue;
  }
  console.log(`\n#${r.id} [${r.editorial_score}/10] ${r.source_id} · ${r.published_at ?? 'no pub time'}`);
  console.log(`  ${String(r.headline).replace(/\s+/g, ' ').slice(0, 160)}`);
  if (r.url) console.log(`  ${r.url}`);
  const reasons = JSON.parse(r.reason_codes ?? '[]');
  if (reasons.length) console.log(`  reasons: ${reasons.join(', ')}`);
}

const skipped = db.prepare(`
  SELECT COUNT(*) n FROM normalized_candidates WHERE created_at > ? AND queue NOT IN ('P0_POST_NOW','P1_VERIFY')
`).get(since) as { n: number };
console.log(`\n(${skipped.n} candidates filtered into P2/MONITORING/REJECTED in the same window)`);
