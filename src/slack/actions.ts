import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

const FEEDBACK_LABELS = new Set([
  'post_worthy', 'useful', 'who_cares', 'duplicate', 'stale', 'bad_source', 'wrong_fit',
]);
const STATE_ACTIONS = new Set(['approve', 'mark_posted', 'rewrite', 'needs_source', 'skip']);

/** Verify Slack request signature (v0 scheme). */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac('sha256', signingSecret).update(base).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export interface ActionOutcome {
  ok: boolean;
  duplicate?: boolean;
  message: string;
}

/**
 * Handle one Slack block action. Idempotent on
 * (candidate, message_ts, action, user); feedback upserts per user.
 */
export function handleAction(
  db: Database.Database,
  params: {
    candidateId: number;
    actionId: string;
    userId: string;
    messageTs?: string;
    value?: string; // e.g. X URL for mark_posted, note text
  },
): ActionOutcome {
  const { candidateId, actionId, userId } = params;
  const cand = db
    .prepare('SELECT id, cluster_id, status, draft_copy FROM normalized_candidates WHERE id = ?')
    .get(candidateId) as { id: number; cluster_id: number | null; status: string; draft_copy: string | null } | undefined;
  if (!cand) return { ok: false, message: `unknown candidate ${candidateId}` };

  const idemKey = [candidateId, cand.cluster_id ?? '-', params.messageTs ?? '-', actionId, userId].join('|');
  try {
    db.prepare(
      'INSERT INTO slack_actions (idempotency_key, candidate_id, action_id, user_id, payload) VALUES (?,?,?,?,?)',
    ).run(idemKey, candidateId, actionId, userId, params.value ?? null);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return { ok: true, duplicate: true, message: 'already recorded' };
    }
    throw err;
  }

  if (FEEDBACK_LABELS.has(actionId)) {
    db.prepare(`
      INSERT INTO feedback_votes (candidate_id, user_id, label, note) VALUES (?,?,?,?)
      ON CONFLICT(candidate_id, user_id) DO UPDATE SET label = excluded.label, note = excluded.note,
        created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(candidateId, userId, actionId, params.value ?? null);
    return { ok: true, message: `feedback ${actionId} recorded` };
  }

  if (STATE_ACTIONS.has(actionId)) {
    switch (actionId) {
      case 'approve':
        db.prepare("UPDATE normalized_candidates SET status = 'approved' WHERE id = ?").run(candidateId);
        db.prepare(
          'INSERT INTO copy_examples (candidate_id, draft_copy, approved_copy, editor_user) VALUES (?,?,?,?)',
        ).run(candidateId, cand.draft_copy, params.value ?? cand.draft_copy, userId);
        return { ok: true, message: 'approved' };
      case 'mark_posted': {
        const xUrl = params.value;
        if (!xUrl || !/^https?:\/\/(x|twitter)\.com\//.test(xUrl)) {
          return { ok: false, message: 'mark_posted requires an X post URL' };
        }
        try {
          db.prepare('INSERT INTO posted_links (candidate_id, x_url) VALUES (?,?)').run(candidateId, xUrl);
        } catch (err) {
          if (err instanceof Error && err.message.includes('UNIQUE')) {
            return { ok: true, duplicate: true, message: 'already marked posted' };
          }
          throw err;
        }
        db.prepare("UPDATE normalized_candidates SET status = 'posted' WHERE id = ?").run(candidateId);
        if (cand.cluster_id) {
          db.prepare("UPDATE event_clusters SET status = 'posted' WHERE id = ?").run(cand.cluster_id);
        }
        return { ok: true, message: 'marked posted' };
      }
      case 'rewrite':
        db.prepare("UPDATE normalized_candidates SET status = 'rewrite' WHERE id = ?").run(candidateId);
        db.prepare(
          'INSERT INTO copy_examples (candidate_id, draft_copy, edit_reason, editor_user) VALUES (?,?,?,?)',
        ).run(candidateId, cand.draft_copy, params.value ?? 'rewrite requested', userId);
        return { ok: true, message: 'rewrite recorded' };
      case 'needs_source':
        db.prepare("UPDATE normalized_candidates SET queue = 'P1_VERIFY' WHERE id = ?").run(candidateId);
        return { ok: true, message: 'moved to P1_VERIFY' };
      case 'skip':
        db.prepare("UPDATE normalized_candidates SET status = 'skipped' WHERE id = ?").run(candidateId);
        return { ok: true, message: 'skipped — add a feedback label so the source learns' };
    }
  }

  return { ok: false, message: `unknown action ${actionId}` };
}
