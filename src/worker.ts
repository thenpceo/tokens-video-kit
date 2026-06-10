import { getDb } from './db/db.js';
import { runMigrations } from './db/migrate.js';
import { connectorStatuses } from './config/env.js';
import { acquireLease, releaseLease } from './jobs/lease.js';
import { runIngestOnce } from './pipeline/ingestRun.js';
import { startServer } from './server.js';

const TICK_MS = 60_000;

async function tick(): Promise<void> {
  const db = getDb();
  if (!acquireLease(db, 'ingest', 300)) {
    console.log(`[worker] ingest lease held elsewhere, skipping tick`);
    return;
  }
  try {
    const stats = await runIngestOnce(db);
    if (stats.sourcesPolled > 0 || stats.errors.length > 0) {
      console.log(
        `[worker] polled=${stats.sourcesPolled} seen=${stats.itemsSeen} stored=${stats.candidatesStored} ` +
        `queues=${JSON.stringify(stats.byQueue)} slack=${stats.slackPosted}` +
        (stats.errors.length ? ` errors=${stats.errors.slice(0, 3).join(' | ')}` : ''),
      );
    }
  } finally {
    releaseLease(db, 'ingest');
  }
}

async function main(): Promise<void> {
  const db = getDb();
  const ran = runMigrations(db);
  if (ran.length) console.log(`[worker] applied migrations: ${ran.join(', ')}`);

  for (const c of connectorStatuses()) {
    console.log(`[worker] connector ${c.name}: ${c.enabled ? 'enabled' : `DISABLED (${c.reason})`}`);
  }

  startServer();

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log('[worker] shutting down');
    releaseLease(db, 'ingest');
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await tick();
  setInterval(() => {
    tick().catch((err) => console.error('[worker] tick failed:', err));
  }, TICK_MS);
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
