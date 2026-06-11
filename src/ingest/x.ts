import type Database from 'better-sqlite3';
import { recordHealth } from './http.js';

export interface XTweet {
  id: string;
  text: string;
  url: string;
  createdAt?: string; // UTC ISO
  isRetweet: boolean;
  isReply: boolean;
}

export interface XCredentials {
  twitterApiIoKey?: string;
  bearerToken?: string;
}

/**
 * Provider-level circuit breaker. When twitterapi.io runs out of credits we
 * park the PROVIDER (not each source) and route all X polling through the
 * official API until the park expires.
 */
function providerParked(db: Database.Database, provider: string): boolean {
  const row = db
    .prepare('SELECT backoff_until FROM source_poll_state WHERE source_id = ?')
    .get(`provider-${provider}`) as { backoff_until: string | null } | undefined;
  return Boolean(row?.backoff_until && new Date(row.backoff_until) > new Date());
}

function parkProvider(db: Database.Database, provider: string, minutes: number): void {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  db.prepare(`
    INSERT INTO source_poll_state (source_id, backoff_until) VALUES (?,?)
    ON CONFLICT(source_id) DO UPDATE SET backoff_until = excluded.backoff_until
  `).run(`provider-${provider}`, until);
}

function unparkProvider(db: Database.Database, provider: string): void {
  db.prepare('UPDATE source_poll_state SET backoff_until = NULL WHERE source_id = ?')
    .run(`provider-${provider}`);
}

async function rawFetch(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 20_000,
): Promise<{ status: number; body: string } | { status: 0; body: string; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { status: 0, body: '', error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Primary: twitterapi.io. Returns null on any failure so the caller can
 * fall back to the official API.
 */
async function fetchViaTwitterApiIo(
  db: Database.Database,
  sourceId: string,
  apiKey: string,
  handle: string,
): Promise<XTweet[] | null> {
  const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`;
  const res = await rawFetch(url, { 'X-API-Key': apiKey });
  if (res.status === 402) {
    recordHealth(db, sourceId, 'credits_exhausted', 402, 'twitterapi.io credits exhausted');
    parkProvider(db, 'twitterapi', 360);
    return null;
  }
  if (res.status === 429) {
    recordHealth(db, sourceId, 'rate_limited', 429, 'twitterapi.io rate limited');
    parkProvider(db, 'twitterapi', 5);
    return null;
  }
  if (res.status !== 200) {
    recordHealth(db, sourceId, 'http_error', res.status, ('error' in res ? res.error : res.body).slice(0, 200));
    return null;
  }
  try {
    const data = JSON.parse(res.body);
    if (data.status !== 'success') {
      recordHealth(db, sourceId, 'http_error', res.status, String(data.msg ?? 'twitterapi error'));
      return null;
    }
    const tweets = Array.isArray(data.data?.tweets) ? data.data.tweets : [];
    recordHealth(db, sourceId, 'success', 200);
    return tweets
      .filter((t: any) => t.type === 'tweet' && !t.retweeted_tweet && !/^RT @/.test(t.text ?? ''))
      .map((t: any) => mapTweet(handle, t.id, t.text, t.createdAt, Boolean(t.isReply), t.url))
      .filter((t: XTweet) => t.text.length > 0);
  } catch (err) {
    recordHealth(db, sourceId, 'parse_failed', res.status, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function resolveUserId(
  db: Database.Database,
  bearer: string,
  handle: string,
): Promise<string | null> {
  const key = handle.toLowerCase();
  const cached = db.prepare('SELECT user_id FROM x_user_ids WHERE handle = ?').get(key) as
    | { user_id: string }
    | undefined;
  if (cached) return cached.user_id;

  const res = await rawFetch(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`,
    { Authorization: `Bearer ${bearer}` },
  );
  if (res.status === 429) {
    parkProvider(db, 'xofficial', 15);
    return null;
  }
  if (res.status !== 200) return null;
  try {
    const id = JSON.parse(res.body)?.data?.id;
    if (!id) return null; // suspended/renamed account
    db.prepare('INSERT OR REPLACE INTO x_user_ids (handle, user_id) VALUES (?,?)').run(key, String(id));
    return String(id);
  } catch {
    return null;
  }
}

/** Fallback: official X API v2 user timeline. */
async function fetchViaOfficialX(
  db: Database.Database,
  sourceId: string,
  bearer: string,
  handle: string,
): Promise<XTweet[] | null> {
  if (providerParked(db, 'xofficial')) return null;

  const userId = await resolveUserId(db, bearer, handle);
  if (!userId) {
    recordHealth(db, sourceId, 'http_error', undefined, `official X: could not resolve @${handle}`);
    return null;
  }

  const url =
    `https://api.x.com/2/users/${userId}/tweets?max_results=10&exclude=retweets,replies&tweet.fields=created_at`;
  const res = await rawFetch(url, { Authorization: `Bearer ${bearer}` });
  if (res.status === 429) {
    recordHealth(db, sourceId, 'rate_limited', 429, 'official X rate limited');
    parkProvider(db, 'xofficial', 15);
    return null;
  }
  if (res.status === 401 || res.status === 403) {
    recordHealth(db, sourceId, 'auth_failed', res.status, 'official X auth failed');
    parkProvider(db, 'xofficial', 60);
    return null;
  }
  if (res.status !== 200) {
    recordHealth(db, sourceId, 'http_error', res.status, ('error' in res ? res.error : res.body).slice(0, 200));
    return null;
  }
  try {
    const data = JSON.parse(res.body);
    const tweets = Array.isArray(data?.data) ? data.data : [];
    recordHealth(db, sourceId, 'success', 200);
    return tweets
      .map((t: any) => mapTweet(handle, t.id, t.text, t.created_at, false))
      .filter((t: XTweet) => t.text.length > 0);
  } catch (err) {
    recordHealth(db, sourceId, 'parse_failed', res.status, err instanceof Error ? err.message : String(err));
    return null;
  }
}

function mapTweet(
  handle: string,
  id: unknown,
  text: unknown,
  createdAt: unknown,
  isReply: boolean,
  url?: unknown,
): XTweet {
  const created = createdAt ? new Date(String(createdAt)) : null;
  return {
    id: String(id),
    text: String(text ?? ''),
    url: typeof url === 'string' && url ? url : `https://x.com/${handle}/status/${id}`,
    createdAt: created && !Number.isNaN(created.getTime()) ? created.toISOString() : undefined,
    isRetweet: false,
    isReply,
  };
}

/**
 * Fetch recent tweets for a handle: twitterapi.io first, official X API as
 * fallback. Returns [] when both providers fail (failures are recorded as
 * source health events, never silently dropped).
 */
export async function fetchXTimeline(
  db: Database.Database,
  sourceId: string,
  creds: XCredentials,
  handle: string,
): Promise<XTweet[]> {
  if (creds.twitterApiIoKey && !providerParked(db, 'twitterapi')) {
    const primary = await fetchViaTwitterApiIo(db, sourceId, creds.twitterApiIoKey, handle);
    if (primary !== null) {
      unparkProvider(db, 'twitterapi');
      return primary;
    }
  }
  if (creds.bearerToken) {
    const fallback = await fetchViaOfficialX(db, sourceId, creds.bearerToken, handle);
    if (fallback !== null) return fallback;
  }
  return [];
}
