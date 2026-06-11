import type Database from 'better-sqlite3';
import { recordHealth } from './http.js';

export interface RatingEvent {
  externalId: string;
  ticker: string;
  company: string;
  headline: string;
  body: string;
  url?: string;
  publishedAt?: string;
  importance: number;
}

export interface MacroPrintEvent {
  externalId: string;
  headline: string;
  body: string;
  publishedAt?: string;
  importance: number;
}

async function getJson(url: string, timeoutMs = 15_000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return { __status: res.status };
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function alreadyEmitted(db: Database.Database, lane: string, id: string): boolean {
  try {
    db.prepare('INSERT INTO data_lane_emitted (lane, external_id) VALUES (?,?)').run(lane, id);
    return false;
  } catch {
    return true; // PK conflict — already processed
  }
}

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Analyst ratings for the watched tickers (Benzinga ratings calendar). */
export async function fetchAnalystRatings(
  db: Database.Database,
  apiKey: string,
  tickers: string[],
  now = new Date(),
): Promise<RatingEvent[]> {
  const sourceId = 'benzinga-ratings';
  const from = dayStr(new Date(now.getTime() - 24 * 3600_000));
  const url =
    `https://api.benzinga.com/api/v2.1/calendar/ratings?token=${apiKey}` +
    `&parameters%5Bdate_from%5D=${from}&parameters%5Bdate_to%5D=${dayStr(now)}` +
    `&parameters%5Btickers%5D=${encodeURIComponent(tickers.join(','))}&pagesize=100`;
  const data = await getJson(url);
  if (!data || data.__status) {
    recordHealth(db, sourceId, data?.__status === 429 ? 'rate_limited' : 'http_error', data?.__status ?? 0);
    return [];
  }
  recordHealth(db, sourceId, 'success', 200);

  const out: RatingEvent[] = [];
  for (const r of data.ratings ?? []) {
    if (!r.id || !r.ticker || alreadyEmitted(db, 'ratings', String(r.id))) continue;
    const action = String(r.action_company ?? '').toLowerCase(); // upgrades | downgrades | maintains | initiates
    if (action !== 'upgrades' && action !== 'downgrades' && action !== 'initiates') continue;

    const verb = action === 'upgrades' ? 'upgrades' : action === 'downgrades' ? 'downgrades' : 'initiates coverage on';
    const ptPart = r.pt_current
      ? `, price target ${r.pt_prior ? `$${Number(r.pt_prior).toFixed(0)} → ` : ''}$${Number(r.pt_current).toFixed(0)}${
          r.pt_pct_change ? ` (${Number(r.pt_pct_change) >= 0 ? '+' : ''}${Number(r.pt_pct_change).toFixed(0)}%)` : ''
        }`
      : '';
    const ratingPart = r.rating_current
      ? ` to ${r.rating_current}${r.rating_prior && action !== 'initiates' ? ` from ${r.rating_prior}` : ''}`
      : '';
    out.push({
      externalId: String(r.id),
      ticker: String(r.ticker).toUpperCase(),
      company: r.name ?? r.ticker,
      headline: `${r.analyst ?? 'Analyst'} ${verb} ${r.name ?? r.ticker} ($${String(r.ticker).toUpperCase()})${ratingPart}${ptPart}`,
      body: `Analyst action via Benzinga ratings calendar. Analyst: ${r.analyst_name ?? r.analyst ?? 'n/a'}. Importance ${r.importance ?? 'n/a'}.${r.notes ? ` Notes: ${r.notes}` : ''}`,
      url: r.url ?? undefined,
      publishedAt: r.date && r.time ? new Date(`${r.date}T${r.time}Z`).toISOString() : undefined,
      importance: Number(r.importance ?? 0),
    });
  }
  return out;
}

const MACRO_EVENTS = /\b(CPI|PPI|nonfarm|non-farm|payrolls|unemployment rate|FOMC|fed funds|interest rate decision|GDP|retail sales|PCE|jobless claims|consumer confidence|ISM)\b/i;

/** High-importance macro prints with actuals (Benzinga economics calendar). */
export async function fetchMacroPrints(
  db: Database.Database,
  apiKey: string,
  now = new Date(),
): Promise<MacroPrintEvent[]> {
  const sourceId = 'benzinga-economics';
  const url =
    `https://api.benzinga.com/api/v2.1/calendar/economics?token=${apiKey}` +
    `&parameters%5Bdate_from%5D=${dayStr(now)}&parameters%5Bdate_to%5D=${dayStr(now)}&pagesize=100`;
  const data = await getJson(url);
  if (!data || data.__status) {
    recordHealth(db, sourceId, data?.__status === 429 ? 'rate_limited' : 'http_error', data?.__status ?? 0);
    return [];
  }
  recordHealth(db, sourceId, 'success', 200);

  const out: MacroPrintEvent[] = [];
  for (const e of data.economics ?? []) {
    if (!e.id || e.country !== 'USA') continue;
    if (e.actual === undefined || e.actual === null || e.actual === '') continue; // not printed yet
    const name = String(e.event_name ?? '');
    const important = Number(e.importance ?? 0) >= 4 || MACRO_EVENTS.test(name);
    if (!important) continue;
    if (alreadyEmitted(db, 'economics', String(e.id))) continue;

    const fmt = (v: unknown, t: unknown) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v);
      const unit = String(t ?? '');
      if (unit === '%') return `${n}%`;
      if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
      if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
      return `${n}${unit}`;
    };
    const actual = fmt(e.actual, e.actual_t);
    const consensus = e.consensus !== '' && e.consensus !== null && e.consensus !== undefined
      ? fmt(e.consensus, e.consensus_t)
      : null;
    const beatMiss = consensus
      ? Number(e.actual) > Number(e.consensus) ? 'above' : Number(e.actual) < Number(e.consensus) ? 'below' : 'in line with'
      : null;
    out.push({
      externalId: String(e.id),
      headline: consensus
        ? `US ${name} (${e.event_period ?? ''}) comes in at ${actual}, ${beatMiss} expectations of ${consensus}`
        : `US ${name} (${e.event_period ?? ''}): ${actual}`,
      body: String(e.description ?? '').slice(0, 400),
      publishedAt: e.date && e.time ? new Date(`${e.date}T${e.time}Z`).toISOString() : undefined,
      importance: Number(e.importance ?? 0),
    });
  }
  return out;
}
