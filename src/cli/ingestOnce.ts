import { getDb } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';
import { connectorStatuses } from '../config/env.js';
import { runIngestOnce } from '../pipeline/ingestRun.js';

const args = new Set(process.argv.slice(2));
const post = !args.has('--no-slack');
const all = args.has('--all'); // ignore poll intervals, poll everything now

async function main(): Promise<void> {
  const db = getDb();
  runMigrations(db);
  for (const c of connectorStatuses()) {
    console.log(`connector ${c.name}: ${c.enabled ? 'enabled' : `DISABLED (${c.reason})`}`);
  }
  console.log(`\nIngesting${post ? ' (posting P0/P1 to Slack)' : ' (dry run, no Slack)'}...`);
  const stats = await runIngestOnce(db, { postToSlack: post, onlyDue: !all });
  console.log(JSON.stringify(stats, null, 2));

  const queues = db.prepare(
    'SELECT queue, COUNT(*) AS n FROM normalized_candidates GROUP BY queue ORDER BY n DESC',
  ).all();
  console.log('\nCandidates by queue (all time):', queues);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
