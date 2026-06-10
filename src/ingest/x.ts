import type Database from 'better-sqlite3';
import { fetchWithHealth, recordHealth } from './http.js';

export interface XTweet {
  id: string;
  text: string;
  url: string;
  createdAt?: string; // UTC ISO
  isRetweet: boolean;
  isReply: boolean;
}

/**
 * Fetch recent tweets for a handle via twitterapi.io.
 * Replies are kept (flagged) but retweets are dropped: a retweet is the
 * other account's news and would mis-attribute source quality.
 */
export async function fetchXTimeline(
  db: Database.Database,
  sourceId: string,
  apiKey: string,
  handle: string,
): Promise<XTweet[]> {
  const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`;
  const res = await fetchWithHealth(db, sourceId, url, { 'X-API-Key': apiKey }, 20_000);
  if (!res.ok) return [];
  try {
    const data = JSON.parse(res.body);
    if (data.status !== 'success') {
      recordHealth(db, sourceId, 'http_error', res.status, String(data.msg ?? 'twitterapi error'));
      return [];
    }
    const tweets = Array.isArray(data.data?.tweets) ? data.data.tweets : [];
    return tweets
      .filter((t: any) => t.type === 'tweet' && !t.retweeted_tweet && !/^RT @/.test(t.text ?? ''))
      .map((t: any) => {
        const created = t.createdAt ? new Date(t.createdAt) : null;
        return {
          id: String(t.id),
          text: String(t.text ?? ''),
          url: t.url ?? `https://x.com/${handle}/status/${t.id}`,
          createdAt: created && !Number.isNaN(created.getTime()) ? created.toISOString() : undefined,
          isRetweet: false,
          isReply: Boolean(t.isReply),
        };
      })
      .filter((t: XTweet) => t.text.length > 0);
  } catch (err) {
    recordHealth(db, sourceId, 'parse_failed', res.status, err instanceof Error ? err.message : String(err));
    return [];
  }
}
