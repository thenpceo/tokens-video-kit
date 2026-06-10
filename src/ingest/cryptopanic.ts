import type Database from 'better-sqlite3';
import { fetchWithHealth, recordHealth } from './http.js';

export interface DetectorItem {
  title: string;
  url?: string;
  publishedAt?: string;
  sourceDomain?: string;
}

/**
 * CryptoPanic fast-detector feed. Tier C: items can never reach P0 directly;
 * they route through P1_VERIFY/monitoring and serve as cluster confirmation.
 */
export async function fetchCryptoPanic(
  db: Database.Database,
  apiKey: string,
): Promise<DetectorItem[]> {
  const sourceId = 'cryptopanic-detector';
  const url = `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${apiKey}&filter=important&public=true`;
  const res = await fetchWithHealth(db, sourceId, url, { Accept: 'application/json' });
  if (!res.ok) return [];
  try {
    const data = JSON.parse(res.body);
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((r: any) => ({
      title: r.title ?? '',
      url: r.original_url ?? r.url ?? undefined,
      publishedAt: r.published_at ? new Date(r.published_at).toISOString() : undefined,
      sourceDomain: r.source?.domain ?? undefined,
    })).filter((i: DetectorItem) => i.title);
  } catch (err) {
    recordHealth(db, sourceId, 'parse_failed', res.status, err instanceof Error ? err.message : String(err));
    return [];
  }
}
