import type Database from 'better-sqlite3';
import { recordHealth } from './http.js';
import type { SourceRegistry } from '../registry/loadSourceRegistry.js';

export interface MoveEvent {
  symbol: string;
  name: string;
  pctChange: number;   // signed daily % change
  price: number;
  kind: 'stock' | 'etf' | 'crypto';
  headline: string;
  body: string;
}

/** Daily-change thresholds for emitting a move candidate. */
export const MOVE_THRESHOLDS = { stock: 4, etf: 1.5, crypto: 5 } as const;
/** Re-alert only when the move extends this many points beyond the last alert. */
export const REALERT_STEP = 2;

const ETF_SYMBOLS = new Set(['SPY', 'QQQ', 'GLD', 'XAG', 'IWM', 'DIA']);
const CRYPTO_IDS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };
const ETF_NAMES: Record<string, string> = {
  SPY: 'S&P 500 (SPY)', QQQ: 'Nasdaq 100 (QQQ)', GLD: 'Gold (GLD)',
  IWM: 'Russell 2000 (IWM)', DIA: 'Dow (DIA)',
};

export function isUsMarketHours(now = new Date()): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 13 * 60 + 30 && mins <= 20 * 60 + 30; // 13:30–20:30 UTC
}

/** Symbols to watch: registry equities + core ETFs. */
export function moverSymbols(registry: SourceRegistry): Array<{ symbol: string; name: string; kind: 'stock' | 'etf' }> {
  const out = new Map<string, { symbol: string; name: string; kind: 'stock' | 'etf' }>();
  for (const a of registry.asset_sources) {
    const sym = a.symbol.toUpperCase();
    if (CRYPTO_IDS[sym]) continue;
    out.set(sym, { symbol: sym, name: a.name, kind: ETF_SYMBOLS.has(sym) ? 'etf' : 'stock' });
  }
  for (const sym of ETF_SYMBOLS) {
    if (!out.has(sym) && ETF_NAMES[sym]) out.set(sym, { symbol: sym, name: ETF_NAMES[sym], kind: 'etf' });
  }
  return [...out.values()];
}

export function describeMove(name: string, symbol: string, pct: number, price: number, kind: string): { headline: string; body: string } {
  const verb = pct >= 0 ? 'surges' : 'falls';
  const abs = Math.abs(pct).toFixed(1);
  const priceStr = kind === 'crypto' && price > 1000 ? `$${Math.round(price).toLocaleString('en-US')}` : `$${price.toFixed(2)}`;
  return {
    headline: `${name} ($${symbol}) ${verb} ${abs}% on the day, trading at ${priceStr}`,
    body: `Daily move detected from live market data: ${symbol} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% at ${priceStr}.`,
  };
}

/** Returns true (and records it) if this move clears alert/re-alert thresholds. */
export function shouldAlertMove(
  db: Database.Database,
  symbol: string,
  pct: number,
  threshold: number,
  now = new Date(),
): boolean {
  if (Math.abs(pct) < threshold) return false;
  const day = now.toISOString().slice(0, 10);
  const row = db.prepare('SELECT last_alerted_pct FROM market_move_alerts WHERE symbol = ? AND day = ?')
    .get(symbol, day) as { last_alerted_pct: number } | undefined;
  if (row && Math.abs(pct) < Math.abs(row.last_alerted_pct) + REALERT_STEP) return false;
  db.prepare(`
    INSERT INTO market_move_alerts (symbol, day, last_alerted_pct) VALUES (?,?,?)
    ON CONFLICT(symbol, day) DO UPDATE SET last_alerted_pct = excluded.last_alerted_pct
  `).run(symbol, day, pct);
  return true;
}

async function getJson(url: string, timeoutMs = 15_000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { __status: res.status };
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll Finnhub quotes for the equity/ETF universe and CoinGecko for crypto
 * majors; emit move events that clear thresholds. Equities are only polled
 * during US market hours; crypto polls around the clock.
 */
export async function detectMarketMoves(
  db: Database.Database,
  registry: SourceRegistry,
  finnhubKey: string | undefined,
  now = new Date(),
): Promise<MoveEvent[]> {
  const sourceId = 'market-movers';
  const out: MoveEvent[] = [];

  if (finnhubKey && isUsMarketHours(now)) {
    let failures = 0;
    for (const { symbol, name, kind } of moverSymbols(registry)) {
      const q = await getJson(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubKey}`);
      if (!q || q.__status || typeof q.dp !== 'number' || q.dp === null) {
        if (q?.__status === 429) { recordHealth(db, sourceId, 'rate_limited', 429); break; }
        failures++;
        continue;
      }
      if (shouldAlertMove(db, symbol, q.dp, MOVE_THRESHOLDS[kind], now)) {
        const { headline, body } = describeMove(name, symbol, q.dp, q.c, kind);
        out.push({ symbol, name, pctChange: q.dp, price: q.c, kind, headline, body });
      }
    }
    if (failures === 0) recordHealth(db, sourceId, 'success', 200);
  }

  // Crypto majors: 24/7 via CoinGecko (no key needed at this rate).
  const ids = Object.values(CRYPTO_IDS).join(',');
  const cg = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
  if (cg && !cg.__status) {
    for (const [symbol, id] of Object.entries(CRYPTO_IDS)) {
      const entry = cg[id];
      if (!entry || typeof entry.usd_24h_change !== 'number') continue;
      if (shouldAlertMove(db, symbol, entry.usd_24h_change, MOVE_THRESHOLDS.crypto, now)) {
        const name = symbol === 'BTC' ? 'Bitcoin' : symbol === 'ETH' ? 'Ethereum' : 'Solana';
        const { headline, body } = describeMove(name, symbol, entry.usd_24h_change, entry.usd, 'crypto');
        out.push({ symbol, name, pctChange: entry.usd_24h_change, price: entry.usd, kind: 'crypto', headline, body });
      }
    }
    recordHealth(db, 'market-movers-crypto', 'success', 200);
  }

  return out;
}
