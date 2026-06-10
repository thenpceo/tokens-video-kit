import { getDb } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';
import { getEnv } from '../config/env.js';
import { renderCandidateCard } from '../slack/card.js';
import { postToSlack } from '../slack/post.js';
import { draftCopy } from '../pipeline/draft.js';
import type { CandidateInput, RoutingDecision } from '../pipeline/types.js';

const id = Number(process.argv[2]);
if (!id) {
  console.error('usage: tsx src/cli/postCandidate.ts <candidate_id>');
  process.exit(1);
}

async function main(): Promise<void> {
  const db = getDb();
  runMigrations(db);
  const cand = db.prepare('SELECT * FROM normalized_candidates WHERE id = ?').get(id) as any;
  if (!cand) throw new Error(`candidate ${id} not found`);
  const trace = db.prepare(
    'SELECT * FROM decision_traces WHERE candidate_id = ? ORDER BY id DESC LIMIT 1',
  ).get(id) as any;
  if (!trace) throw new Error(`no decision trace for candidate ${id}`);

  const input: CandidateInput = {
    sourceId: cand.source_id,
    sourceName: cand.source_id,
    sourceTier: cand.source_tier,
    sourceRoute: cand.source_route,
    sourceType: 'replay',
    headline: cand.headline,
    body: cand.body ?? undefined,
    url: cand.url ?? undefined,
    publishedAt: cand.published_at ?? undefined,
    firstSeenAt: cand.first_seen_at,
  };
  const decision: RoutingDecision = {
    queue: cand.queue,
    reasonCodes: JSON.parse(cand.reason_codes ?? '[]'),
    gateResults: JSON.parse(trace.gate_results),
    score: JSON.parse(trace.score_breakdown),
    matchedAssets: JSON.parse(cand.matched_assets ?? '[]'),
    ttl: JSON.parse(trace.ttl_decision),
    clusterKey: JSON.parse(trace.dedupe_result).cluster_key,
    duplicate: false,
  };

  let draft = cand.draft_copy as string | null;
  if (!draft) {
    draft = await draftCopy(input, decision);
    db.prepare('UPDATE normalized_candidates SET draft_copy = ? WHERE id = ?').run(draft, id);
  }

  const env = getEnv();
  const interactive = Boolean(env.SLACK_BOT_TOKEN && env.SLACK_SIGNING_SECRET);
  const card = renderCandidateCard(id, input, decision, draft, interactive);
  const res = await postToSlack(db, id, card);
  console.log(JSON.stringify(res, null, 2));
  if (res.ok) {
    db.prepare("UPDATE normalized_candidates SET status = 'sent' WHERE id = ? AND status = 'new'").run(id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
