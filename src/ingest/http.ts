import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { nowUtc } from '../db/db.js';

export interface FetchResult {
  ok: boolean;
  status: number;
  body: string;
  hash: string;
  error?: string;
}

/** Bounded fetch with health-event recording and per-source backoff state. */
export async function fetchWithHealth(
  db: Database.Database,
  sourceId: string,
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 15_000,
): Promise<FetchResult> {
  const poll = db
    .prepare('SELECT backoff_until FROM source_poll_state WHERE source_id = ?')
    .get(sourceId) as { backoff_until: string | null } | undefined;
  if (poll?.backoff_until && new Date(poll.backoff_until) > new Date()) {
    return { ok: false, status: 0, body: '', hash: '', error: 'backoff' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
    const body = await res.text();
    const hash = crypto.createHash('sha1').update(body).digest('hex');

    if (res.ok) {
      recordHealth(db, sourceId, 'success', res.status);
      resetBackoff(db, sourceId);
      return { ok: true, status: res.status, body, hash };
    }
    const type = res.status === 429 ? 'rate_limited' : res.status === 401 || res.status === 403 ? 'auth_failed' : 'http_error';
    recordHealth(db, sourceId, type, res.status, body.slice(0, 200));
    bumpBackoff(db, sourceId);
    return { ok: false, status: res.status, body, hash, error: type };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordHealth(db, sourceId, 'http_error', 0, msg);
    bumpBackoff(db, sourceId);
    return { ok: false, status: 0, body: '', hash: '', error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export function recordHealth(
  db: Database.Database,
  sourceId: string,
  eventType: string,
  httpStatus?: number,
  detail?: string,
): void {
  db.prepare(
    'INSERT INTO source_health_events (source_id, event_type, http_status, detail) VALUES (?,?,?,?)',
  ).run(sourceId, eventType, httpStatus ?? null, detail ?? null);

  const isSuccess = eventType === 'success';
  db.prepare(`
    INSERT INTO source_health_state (source_id, last_success_at, last_error_at, consecutive_failures, last_http_status, rate_limited)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      last_success_at = CASE WHEN ? THEN excluded.last_success_at ELSE last_success_at END,
      last_error_at = CASE WHEN ? THEN last_error_at ELSE excluded.last_error_at END,
      consecutive_failures = CASE WHEN ? THEN 0 ELSE consecutive_failures + 1 END,
      last_http_status = excluded.last_http_status,
      rate_limited = excluded.rate_limited
  `).run(
    sourceId,
    isSuccess ? nowUtc() : null,
    isSuccess ? null : nowUtc(),
    isSuccess ? 0 : 1,
    httpStatus ?? null,
    eventType === 'rate_limited' ? 1 : 0,
    isSuccess ? 1 : 0,
    isSuccess ? 1 : 0,
    isSuccess ? 1 : 0,
  );
}

function bumpBackoff(db: Database.Database, sourceId: string): void {
  const row = db
    .prepare('SELECT retry_count FROM source_poll_state WHERE source_id = ?')
    .get(sourceId) as { retry_count: number } | undefined;
  const retries = (row?.retry_count ?? 0) + 1;
  const delayMin = Math.min(120, 2 ** retries); // 2,4,8,... capped at 2h
  const until = new Date(Date.now() + delayMin * 60_000).toISOString();
  db.prepare(`
    INSERT INTO source_poll_state (source_id, retry_count, backoff_until) VALUES (?,?,?)
    ON CONFLICT(source_id) DO UPDATE SET retry_count = ?, backoff_until = ?
  `).run(sourceId, retries, until, retries, until);
}

function resetBackoff(db: Database.Database, sourceId: string): void {
  db.prepare(`
    INSERT INTO source_poll_state (source_id, retry_count, backoff_until, last_polled_at) VALUES (?,0,NULL,?)
    ON CONFLICT(source_id) DO UPDATE SET retry_count = 0, backoff_until = NULL, last_polled_at = ?
  `).run(sourceId, nowUtc(), nowUtc());
}
