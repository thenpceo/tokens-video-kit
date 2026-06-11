import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { testDb, REGISTRY_PATH } from './helpers.js';
import { crossedRoundLevel, lastSnapshot, saveSnapshot } from '../src/ingest/metrics.js';
import { evaluateCandidate } from '../src/pipeline/evaluate.js';
import { loadSourceRegistry } from '../src/registry/loadSourceRegistry.js';
import type { CandidateInput } from '../src/pipeline/types.js';

const registry = loadSourceRegistry(REGISTRY_PATH);
let db: Database.Database;

beforeEach(() => {
  db = testDb();
});

describe('round-level crossings', () => {
  it('detects upward crossings', () => {
    expect(crossedRoundLevel(98_500, 101_200, 10_000)).toBe(100_000);
    expect(crossedRoundLevel(62, 78, 25)).toBe(75);
  });

  it('detects downward crossings at the crossed level', () => {
    expect(crossedRoundLevel(101_200, 98_500, 10_000)).toBe(100_000);
  });

  it('returns null when no level crossed', () => {
    expect(crossedRoundLevel(101_200, 108_000, 10_000)).toBeNull();
    expect(crossedRoundLevel(66, 70, 25)).toBeNull();
  });
});

describe('snapshots', () => {
  it('stores and retrieves the latest value', () => {
    expect(lastSnapshot(db, 'price:SOL')).toBeNull();
    saveSnapshot(db, 'price:SOL', 66.5);
    saveSnapshot(db, 'price:SOL', 67.2);
    expect(lastSnapshot(db, 'price:SOL')).toBe(67.2);
  });
});

describe('milestone candidates route correctly', () => {
  it('ATH milestone is fresh market_move and surfaces', () => {
    const now = new Date().toISOString();
    const d = evaluateCandidate({
      sourceId: 'metric-milestones', sourceName: 'Metric milestones (CoinGecko)',
      sourceTier: 'A', sourceRoute: 'p0_eligible', sourceType: 'market_data',
      headline: 'Solana ($SOL) hits a new all-time high of $295',
      body: 'New ATH milestone from live market data. Current price $295, 24h change 8.1%.',
      publishedAt: now, firstSeenAt: now, assetSymbolHint: 'SOL',
    } as CandidateInput, registry, { isDuplicate: () => false });
    expect(d.ttl.category).toBe('market_move');
    expect(['P0_POST_NOW', 'P1_VERIFY']).toContain(d.queue);
  });
});
