import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { testDb } from './helpers.js';
import { handleAction, verifySlackSignature } from '../src/slack/actions.js';
import crypto from 'node:crypto';

let db: Database.Database;

function seedCandidate(): number {
  db.prepare(
    "INSERT INTO event_clusters (cluster_key, first_seen_at, last_seen_at, headline) VALUES ('k1', '2026-06-10T00:00:00Z', '2026-06-10T00:00:00Z', 'h')",
  ).run();
  const res = db.prepare(`
    INSERT INTO normalized_candidates (cluster_id, source_id, source_tier, source_route, headline, first_seen_at, queue, status, draft_copy)
    VALUES (1, 'src', 'A', 'p0_eligible', 'Test headline', '2026-06-10T00:00:00Z', 'P0_POST_NOW', 'sent', 'draft text')
  `).run();
  return Number(res.lastInsertRowid);
}

beforeEach(() => {
  db = testDb();
});

describe('slack actions', () => {
  it('records feedback and is idempotent on retries', () => {
    const id = seedCandidate();
    const params = { candidateId: id, actionId: 'post_worthy', userId: 'U1', messageTs: '123.456' };
    expect(handleAction(db, params).ok).toBe(true);
    const retry = handleAction(db, params);
    expect(retry.ok).toBe(true);
    expect(retry.duplicate).toBe(true);
    const votes = db.prepare('SELECT * FROM feedback_votes').all();
    expect(votes.length).toBe(1);
  });

  it('latest rating per user wins, multiple users aggregate', () => {
    const id = seedCandidate();
    handleAction(db, { candidateId: id, actionId: 'useful', userId: 'U1', messageTs: '1' });
    handleAction(db, { candidateId: id, actionId: 'post_worthy', userId: 'U1', messageTs: '2' });
    handleAction(db, { candidateId: id, actionId: 'who_cares', userId: 'U2', messageTs: '3' });
    const votes = db.prepare('SELECT user_id, label FROM feedback_votes ORDER BY user_id').all() as Array<{ user_id: string; label: string }>;
    expect(votes).toEqual([
      { user_id: 'U1', label: 'post_worthy' },
      { user_id: 'U2', label: 'who_cares' },
    ]);
  });

  it('mark_posted requires an X URL and closes the cluster', () => {
    const id = seedCandidate();
    const bad = handleAction(db, { candidateId: id, actionId: 'mark_posted', userId: 'U1' });
    expect(bad.ok).toBe(false);
    const good = handleAction(db, {
      candidateId: id, actionId: 'mark_posted', userId: 'U1', messageTs: '9',
      value: 'https://x.com/tokens/status/123',
    });
    expect(good.ok).toBe(true);
    const cand = db.prepare('SELECT status FROM normalized_candidates WHERE id = ?').get(id) as { status: string };
    expect(cand.status).toBe('posted');
    const cluster = db.prepare('SELECT status FROM event_clusters WHERE id = 1').get() as { status: string };
    expect(cluster.status).toBe('posted');
  });

  it('approve stores a copy example', () => {
    const id = seedCandidate();
    handleAction(db, { candidateId: id, actionId: 'approve', userId: 'U1', messageTs: '5', value: 'final copy' });
    const ex = db.prepare('SELECT draft_copy, approved_copy FROM copy_examples').get() as { draft_copy: string; approved_copy: string };
    expect(ex.draft_copy).toBe('draft text');
    expect(ex.approved_copy).toBe('final copy');
  });

  it('verifies slack signatures', () => {
    const secret = 'test-secret';
    const ts = String(Math.floor(Date.now() / 1000));
    const body = 'payload=%7B%7D';
    const sig = `v0=${crypto.createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
    expect(verifySlackSignature(secret, ts, body, sig)).toBe(true);
    expect(verifySlackSignature(secret, ts, body + 'x', sig)).toBe(false);
    expect(verifySlackSignature(secret, '100', body, sig)).toBe(false); // too old
  });
});
