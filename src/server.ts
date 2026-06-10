import http from 'node:http';
import { getDb } from './db/db.js';
import { getEnv, connectorStatuses } from './config/env.js';
import { loadSourceRegistry } from './registry/loadSourceRegistry.js';
import { handleAction, verifySlackSignature } from './slack/actions.js';

export function startServer(): http.Server {
  const env = getEnv();

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';

    if (req.method === 'GET' && url === '/healthz') {
      let dbOk = false;
      let registryOk = false;
      try {
        getDb().prepare('SELECT 1').get();
        dbOk = true;
      } catch { /* reported below */ }
      try {
        loadSourceRegistry();
        registryOk = true;
      } catch { /* reported below */ }
      const body = {
        ok: dbOk && registryOk,
        db: dbOk,
        registry: registryOk,
        slack_signing_configured: Boolean(env.SLACK_SIGNING_SECRET),
        connectors: connectorStatuses(),
      };
      res.writeHead(body.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === 'GET' && url === '/readyz') {
      try {
        const db = getDb();
        const migrated = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
        loadSourceRegistry();
        res.writeHead(migrated.n > 0 ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ready: migrated.n > 0 }));
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ready: false, error: err instanceof Error ? err.message : String(err) }));
      }
      return;
    }

    if (req.method === 'POST' && url === '/slack/actions') {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        if (!env.SLACK_SIGNING_SECRET) {
          res.writeHead(503);
          res.end('slack interactivity not configured');
          return;
        }
        const ts = req.headers['x-slack-request-timestamp'] as string | undefined;
        const sig = req.headers['x-slack-signature'] as string | undefined;
        if (!ts || !sig || !verifySlackSignature(env.SLACK_SIGNING_SECRET, ts, raw, sig)) {
          res.writeHead(401);
          res.end('bad signature');
          return;
        }
        try {
          const params = new URLSearchParams(raw);
          const payload = JSON.parse(params.get('payload') ?? '{}');
          const db = getDb();
          for (const action of payload.actions ?? []) {
            handleAction(db, {
              candidateId: Number(action.value),
              actionId: action.action_id,
              userId: payload.user?.id ?? 'unknown',
              messageTs: payload.message?.ts,
            });
          }
          res.writeHead(200);
          res.end('');
        } catch (err) {
          console.error('[server] slack action failed:', err);
          res.writeHead(200); // 200 so Slack does not retry-storm; error is logged
          res.end('');
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  server.listen(env.PORT, () => {
    console.log(`[server] listening on :${env.PORT}`);
  });
  return server;
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}
