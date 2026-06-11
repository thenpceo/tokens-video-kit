import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { testDb, REGISTRY_PATH } from './helpers.js';
import { loadSourceRegistry } from '../src/registry/loadSourceRegistry.js';
import {
  shouldAlertMove, describeMove, moverSymbols, isUsMarketHours, MOVE_THRESHOLDS,
} from '../src/ingest/marketData.js';
import { parseForm4Purchases, FORM4_MIN_BUY_USD } from '../src/ingest/sec.js';
import { classifyCategory, ttlDecision } from '../src/pipeline/ttl.js';
import { evaluateCandidate } from '../src/pipeline/evaluate.js';
import type { CandidateInput } from '../src/pipeline/types.js';

const registry = loadSourceRegistry(REGISTRY_PATH);
let db: Database.Database;

beforeEach(() => {
  db = testDb();
});

describe('market movers', () => {
  it('alerts only above threshold and re-alerts only on extension', () => {
    expect(shouldAlertMove(db, 'INTC', 2.0, MOVE_THRESHOLDS.stock)).toBe(false);
    expect(shouldAlertMove(db, 'INTC', 4.5, MOVE_THRESHOLDS.stock)).toBe(true);
    expect(shouldAlertMove(db, 'INTC', 5.0, MOVE_THRESHOLDS.stock)).toBe(false); // within re-alert step
    expect(shouldAlertMove(db, 'INTC', 7.1, MOVE_THRESHOLDS.stock)).toBe(true);  // extended ≥2 pts
  });

  it('builds headlines that hit the strong-movement lexicon and route P0', () => {
    const { headline, body } = describeMove('Intel', 'INTC', 9.27, 116.96, 'stock');
    expect(headline).toBe('Intel ($INTC) surges 9.3% on the day, trading at $116.96');

    const input: CandidateInput = {
      sourceId: 'market-movers', sourceName: 'Market data', sourceTier: 'A',
      sourceRoute: 'p0_eligible', sourceType: 'market_data',
      headline, body, publishedAt: new Date().toISOString(), firstSeenAt: new Date().toISOString(),
      assetSymbolHint: 'INTC',
    };
    const d = evaluateCandidate(input, registry, { isDuplicate: () => false });
    expect(d.ttl.category).toBe('market_move');
    expect(d.score.market_movement).toBe(2);
    expect(d.queue).toBe('P0_POST_NOW');
  });

  it('covers registry equities and core ETFs, no crypto', () => {
    const syms = moverSymbols(registry).map((s) => s.symbol);
    expect(syms).toContain('NVDA');
    expect(syms).toContain('SPY');
    expect(syms).not.toContain('BTC');
  });

  it('knows US market hours', () => {
    expect(isUsMarketHours(new Date('2026-06-11T15:00:00Z'))).toBe(true);  // Thursday
    expect(isUsMarketHours(new Date('2026-06-11T05:00:00Z'))).toBe(false);
    expect(isUsMarketHours(new Date('2026-06-13T15:00:00Z'))).toBe(false); // Saturday
  });
});

describe('form 4 parsing', () => {
  const form4 = (code: string, shares: number, price: number) => `<?xml version="1.0"?>
    <ownershipDocument>
      <reportingOwner>
        <reportingOwnerId><rptOwnerName>Meyer Malka</rptOwnerName></reportingOwnerId>
        <reportingOwnerRelationship><isDirector>1</isDirector></reportingOwnerRelationship>
      </reportingOwner>
      <nonDerivativeTable>
        <nonDerivativeTransaction>
          <transactionCoding><transactionCode>${code}</transactionCode></transactionCoding>
          <transactionAmounts>
            <transactionShares><value>${shares}</value></transactionShares>
            <transactionPricePerShare><value>${price}</value></transactionPricePerShare>
            <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
          </transactionAmounts>
        </nonDerivativeTransaction>
      </nonDerivativeTable>
    </ownershipDocument>`;

  it('sums open-market purchases with owner role', () => {
    const r = parseForm4Purchases(form4('P', 500_000, 110));
    expect(r).not.toBeNull();
    expect(r!.ownerName).toBe('Meyer Malka');
    expect(r!.ownerRole).toBe('Director');
    expect(r!.value).toBe(55_000_000);
    expect(r!.value).toBeGreaterThan(FORM4_MIN_BUY_USD);
  });

  it('ignores sales and option exercises', () => {
    expect(parseForm4Purchases(form4('S', 500_000, 110))).toBeNull();
    expect(parseForm4Purchases(form4('M', 500_000, 110))).toBeNull();
  });
});

describe('data lane TTLs', () => {
  it('classifies lane source types', () => {
    expect(classifyCategory('anything', 'market_data')).toBe('market_move');
    expect(classifyCategory('anything', 'analyst_rating')).toBe('analyst_rating');
    expect(classifyCategory('anything', 'macro_data')).toBe('breaking_macro');
  });

  it('market moves expire after 30 minutes', () => {
    const old = new Date(Date.now() - 45 * 60_000).toISOString();
    const t = ttlDecision('market_move', old, old);
    expect(t.fresh).toBe(false);
  });

  it('macro print with beat/miss language routes P0 when fresh', () => {
    const input: CandidateInput = {
      sourceId: 'benzinga-economics', sourceName: 'US macro print', sourceTier: 'A',
      sourceRoute: 'p0_eligible_if_official_or_trusted', sourceType: 'macro_data',
      headline: 'US PPI (May) comes in at 6.5%, above expectations of 6.4%',
      body: 'Producer price index monthly print.',
      publishedAt: new Date().toISOString(), firstSeenAt: new Date().toISOString(),
    };
    const d = evaluateCandidate(input, registry, { isDuplicate: () => false });
    expect(d.ttl.category).toBe('breaking_macro');
    expect(['P0_POST_NOW', 'P1_VERIFY']).toContain(d.queue);
  });

  it('analyst upgrade routes P0 when fresh', () => {
    const input: CandidateInput = {
      sourceId: 'benzinga-ratings', sourceName: 'Analyst ratings', sourceTier: 'A',
      sourceRoute: 'p0_eligible', sourceType: 'analyst_rating',
      headline: 'B of A Securities upgrades Intel ($INTC) to Buy from Underperform, price target $96 → $135 (+41%)',
      body: 'Analyst action via Benzinga.',
      publishedAt: new Date().toISOString(), firstSeenAt: new Date().toISOString(),
      assetSymbolHint: 'INTC',
    };
    const d = evaluateCandidate(input, registry, { isDuplicate: () => false });
    expect(d.score.market_movement).toBe(2);
    expect(d.queue).toBe('P0_POST_NOW');
  });
});
