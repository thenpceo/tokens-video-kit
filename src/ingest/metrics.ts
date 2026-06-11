import type Database from 'better-sqlite3';
import { recordHealth } from './http.js';

export interface MilestoneEvent {
  externalId: string;   // dedupe key, stable per milestone
  headline: string;
  body: string;
  symbol: string;
}

const COINS: Array<{ id: string; symbol: string; name: string; roundStep: number }> = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', roundStep: 10_000 },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', roundStep: 500 },
  { id: 'solana', symbol: 'SOL', name: 'Solana', roundStep: 25 },
];

export function lastSnapshot(db: Database.Database, metricId: string): number | null {
  const row = db.prepare(
    'SELECT value FROM metric_snapshots WHERE metric_id = ? ORDER BY captured_at DESC LIMIT 1',
  ).get(metricId) as { value: number } | undefined;
  return row?.value ?? null;
}

export function saveSnapshot(db: Database.Database, metricId: string, value: number): void {
  db.prepare('INSERT INTO metric_snapshots (metric_id, value) VALUES (?,?)').run(metricId, value);
}

/** Round level crossed between prev and curr (either direction), or null. */
export function crossedRoundLevel(prev: number, curr: number, step: number): number | null {
  const prevLevel = Math.floor(prev / step);
  const currLevel = Math.floor(curr / step);
  if (prevLevel === currLevel) return null;
  return (curr > prev ? currLevel : prevLevel) * step;
}

function emitted(db: Database.Database, id: string): boolean {
  try {
    db.prepare("INSERT INTO data_lane_emitted (lane, external_id) VALUES ('metric-milestone', ?)").run(id);
    return false;
  } catch {
    return true;
  }
}

function fmtUsd(v: number): string {
  return v >= 1000 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`;
}

/**
 * Detect crypto price milestones via CoinGecko markets data: fresh all-time
 * highs and round-number crossings. Snapshots every value for future
 * INSIGHT-style analysis.
 */
export async function detectMetricMilestones(db: Database.Database): Promise<MilestoneEvent[]> {
  const sourceId = 'metric-milestones';
  const ids = COINS.map((c) => c.id).join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;

  let data: any;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      recordHealth(db, sourceId, res.status === 429 ? 'rate_limited' : 'http_error', res.status);
      return [];
    }
    data = await res.json();
  } catch (err) {
    recordHealth(db, sourceId, 'http_error', 0, err instanceof Error ? err.message : String(err));
    return [];
  }
  recordHealth(db, sourceId, 'success', 200);

  const out: MilestoneEvent[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const coin of COINS) {
    const m = (data as any[]).find((d) => d.id === coin.id);
    if (!m || typeof m.current_price !== 'number') continue;
    const price = m.current_price;
    const prev = lastSnapshot(db, `price:${coin.symbol}`);
    saveSnapshot(db, `price:${coin.symbol}`, price);
    if (typeof m.market_cap === 'number') saveSnapshot(db, `mcap:${coin.symbol}`, m.market_cap);

    // Fresh all-time high (CoinGecko ath_date is today).
    if (m.ath_date && String(m.ath_date).slice(0, 10) === today && !emitted(db, `ath:${coin.symbol}:${today}`)) {
      out.push({
        externalId: `ath:${coin.symbol}:${today}`,
        symbol: coin.symbol,
        headline: `${coin.name} ($${coin.symbol}) hits a new all-time high of ${fmtUsd(m.ath)}`,
        body: `New ATH milestone from live market data. Current price ${fmtUsd(price)}, 24h change ${typeof m.price_change_percentage_24h === 'number' ? m.price_change_percentage_24h.toFixed(1) : '?'}%.`,
      });
    }

    // Round-number crossing since the previous snapshot.
    if (prev !== null) {
      const level = crossedRoundLevel(prev, price, coin.roundStep);
      if (level !== null) {
        const dir = price > prev ? 'crosses above' : 'falls below';
        const id = `round:${coin.symbol}:${level}:${dir}:${today}`;
        if (!emitted(db, id)) {
          out.push({
            externalId: id,
            symbol: coin.symbol,
            headline: `${coin.name} ($${coin.symbol}) ${dir} ${fmtUsd(level)}, trading at ${fmtUsd(price)}`,
            body: `Round-number milestone from live market data. Previous snapshot ${fmtUsd(prev)}.`,
          });
        }
      }
    }
  }
  return out;
}
