import { getDb } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';
import { canonicalizeUrl, clusterKey } from '../pipeline/cluster.js';

/**
 * Missed-story backtrace: given a URL or headline, explain why it never
 * reached P0. Usage: tsx src/cli/missedStory.ts "<url or headline>" ["why it mattered"]
 */
const query = process.argv[2];
const why = process.argv[3];
if (!query) {
  console.error('usage: tsx src/cli/missedStory.ts "<url or headline>" ["why it mattered"]');
  process.exit(1);
}

const db = getDb();
runMigrations(db);

let category = 'source_missing_from_registry';
let detail = '';

const canonical = canonicalizeUrl(query);
const isUrl = /^https?:\/\//.test(query);

const rawHit = isUrl
  ? db.prepare('SELECT * FROM raw_ingest_events WHERE canonical_url = ? OR canonical_url LIKE ?')
      .get(canonical, `%${new URL(query).pathname}%`) as any
  : undefined;

function findByTokens(q: string): any {
  const tokens = q
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
  if (tokens.length === 0) return undefined;
  const where = tokens.map(() => 'LOWER(headline) LIKE ?').join(' AND ');
  return db
    .prepare(`SELECT * FROM normalized_candidates WHERE ${where} ORDER BY id DESC`)
    .get(...tokens.map((t) => `%${t}%`));
}

const candHit = isUrl
  ? db.prepare('SELECT * FROM normalized_candidates WHERE canonical_url = ?').get(canonical) as any
  : findByTokens(query);

const keyHit = !isUrl
  ? db.prepare('SELECT * FROM event_clusters WHERE cluster_key = ?').get(clusterKey(query)) as any
  : undefined;

if (candHit) {
  const trace = db.prepare(
    'SELECT * FROM decision_traces WHERE candidate_id = ? ORDER BY id DESC LIMIT 1',
  ).get(candHit.id) as any;
  const gates = trace ? JSON.parse(trace.gate_results) : {};
  const failed = Object.entries(gates).filter(([, g]: any) => !g.pass).map(([name, g]: any) => `${name} (${g.detail})`);
  if (candHit.queue === 'P0_POST_NOW') {
    category = 'not_missed';
    detail = `Candidate ${candHit.id} DID reach P0 (status ${candHit.status}).`;
  } else if (failed.some((f) => f.startsWith('fresh'))) {
    category = 'ttl_too_strict';
    detail = `Candidate ${candHit.id} routed ${candHit.queue}; failed gates: ${failed.join('; ')}`;
  } else if (failed.some((f) => f.startsWith('non_duplicate'))) {
    category = 'dedupe_mistake';
    detail = `Candidate ${candHit.id} marked duplicate: ${failed.join('; ')}`;
  } else if (failed.some((f) => f.startsWith('verified') || f.startsWith('trusted_source'))) {
    category = 'verification_gate_too_strict';
    detail = `Candidate ${candHit.id} routed ${candHit.queue}; failed gates: ${failed.join('; ')}`;
  } else if (failed.some((f) => f.startsWith('relevant'))) {
    category = 'entity_resolver_miss';
    detail = `Candidate ${candHit.id} routed ${candHit.queue}; relevance gate failed: ${failed.join('; ')}`;
  } else if ((candHit.editorial_score ?? 0) < 8) {
    category = 'score_too_low';
    detail = `Candidate ${candHit.id} scored ${candHit.editorial_score}/10 → ${candHit.queue}. Breakdown: ${candHit.score_breakdown}`;
  } else {
    category = 'slack_routing_too_low';
    detail = `Candidate ${candHit.id} routed ${candHit.queue} with score ${candHit.editorial_score}; reasons: ${candHit.reason_codes}`;
  }
} else if (rawHit) {
  category = 'resolver_or_normalize_failure';
  detail = `Raw event ${rawHit.id} from ${rawHit.source_id} was ingested (parse ${rawHit.parse_status}) but produced no candidate.`;
} else if (keyHit) {
  category = 'dedupe_mistake';
  detail = `No candidate matched, but cluster ${keyHit.cluster_key} ("${keyHit.headline}") covers a similar headline.`;
} else if (isUrl) {
  const host = new URL(query).hostname.replace(/^www\./, '');
  const healthRows = db.prepare(
    "SELECT source_id, consecutive_failures FROM source_health_state WHERE consecutive_failures > 0",
  ).all() as Array<{ source_id: string; consecutive_failures: number }>;
  const broken = healthRows.map((r) => r.source_id).join(', ');
  category = 'source_missing_from_registry';
  detail = `Nothing ingested from ${host}. ${broken ? `Note: sources currently failing: ${broken}. If one of these covers ${host}, this is a source_health_failure instead.` : ''}`;
}

db.prepare(`
  INSERT INTO missed_story_reviews (url_or_headline, why_it_mattered, backtrace_category, backtrace_detail)
  VALUES (?,?,?,?)
`).run(query, why ?? null, category, detail);

console.log(`Backtrace: ${category}`);
console.log(detail);
