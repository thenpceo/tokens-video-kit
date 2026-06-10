import type Database from 'better-sqlite3';
import { getEnv } from '../config/env.js';

export interface SlackPostResult {
  ok: boolean;
  delivery: 'bot' | 'webhook' | 'disabled';
  ts?: string;
  error?: string;
}

/**
 * Post a card to Slack. Prefers chat.postMessage (bot token, returns ts,
 * enables interactivity); falls back to the incoming webhook.
 */
export async function postToSlack(
  db: Database.Database,
  candidateId: number,
  payload: { text: string; blocks: unknown[] },
  channelOverride?: string,
): Promise<SlackPostResult> {
  const env = getEnv();

  if (env.SLACK_BOT_TOKEN && (channelOverride || env.SLACK_POST_CHANNEL_ID)) {
    const channel = channelOverride ?? env.SLACK_POST_CHANNEL_ID!;
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, ...payload }),
    });
    const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
    if (data.ok) {
      db.prepare(
        'INSERT INTO slack_messages (candidate_id, channel, message_ts, delivery) VALUES (?,?,?,?)',
      ).run(candidateId, channel, data.ts ?? null, 'bot');
      return { ok: true, delivery: 'bot', ts: data.ts };
    }
    return { ok: false, delivery: 'bot', error: data.error };
  }

  if (env.SLACK_WEBHOOK_URL) {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      db.prepare(
        'INSERT INTO slack_messages (candidate_id, channel, message_ts, delivery) VALUES (?,?,?,?)',
      ).run(candidateId, null, null, 'webhook');
      return { ok: true, delivery: 'webhook' };
    }
    return { ok: false, delivery: 'webhook', error: `HTTP ${res.status}: ${await res.text()}` };
  }

  return { ok: false, delivery: 'disabled', error: 'no Slack credentials configured' };
}
