import { describe, expect, it } from 'vitest';
import { evaluateCandidate } from '../src/pipeline/evaluate.js';
import { loadSourceRegistry } from '../src/registry/loadSourceRegistry.js';
import type { CandidateInput } from '../src/pipeline/types.js';
import { REGISTRY_PATH } from './helpers.js';

const registry = loadSourceRegistry(REGISTRY_PATH);
const noDupes = { isDuplicate: () => false };
const now = () => new Date().toISOString();

// Phase B regression suite: real stories @tokens posted on 2026-06-11 that
// the v1 scorer under-routed. Each must surface (P0 or P1) when fresh.

describe('corporate announcements from official accounts (was P2 4-5/10)', () => {
  it('OpenAI acquires Ona (official X) surfaces', () => {
    const d = evaluateCandidate({
      sourceId: 'pre-prewejye-x-openainewsroom', sourceName: 'OpenAI Newsroom (X)',
      sourceTier: 'A', sourceRoute: 'p0_eligible', sourceType: 'x',
      headline: "We've reached an agreement to acquire @ona_hq. Its secure cloud execution infrastructure will accelerate Codex, which has grown 400% this year to over 5 million weekly users.",
      publishedAt: now(), firstSeenAt: now(), assetSymbolHint: 'OPENAI',
    } as CandidateInput, registry, noDupes);
    expect(['P0_POST_NOW', 'P1_VERIFY']).toContain(d.queue);
    expect(d.score.thesis_fit).toBe(2);
  });

  it('Coinbase for Agents (official X) surfaces', () => {
    const d = evaluateCandidate({
      sourceId: 'coinbase-x-coinbase', sourceName: 'Coinbase (X)',
      sourceTier: 'A', sourceRoute: 'p0_eligible', sourceType: 'x',
      headline: 'Meet Coinbase for Agents. Give your agent its own account to: execute trades, manage portfolios, and run autonomously under user-set guardrails.',
      publishedAt: now(), firstSeenAt: now(), assetSymbolHint: 'COIN',
    } as CandidateInput, registry, noDupes);
    expect(['P0_POST_NOW', 'P1_VERIFY']).toContain(d.queue);
  });

  it('Anthropic commits $150M to Claude Corps (official X) surfaces', () => {
    const d = evaluateCandidate({
      sourceId: 'pre-pren1fvf-x-anthropicai', sourceName: 'Anthropic (X)',
      sourceTier: 'A', sourceRoute: 'p0_eligible', sourceType: 'x',
      headline: "We're launching Claude Corps, a national fellowship program. Anthropic commits $150M to embed 1,000 trained fellows in nonprofits, with $10K grants for 400+ host organizations.",
      publishedAt: now(), firstSeenAt: now(), assetSymbolHint: 'ANTHROPIC',
    } as CandidateInput, registry, noDupes);
    expect(['P0_POST_NOW', 'P1_VERIFY']).toContain(d.queue);
  });
});

describe('tier C detector scoops (was MONITORING)', () => {
  it('SpaceX investment-grade ratings scoop reaches P1, never P0', () => {
    const d = evaluateCandidate({
      sourceId: 'stockmktnewz', sourceName: 'StockMKTNewz', sourceTier: 'C',
      sourceRoute: 'p1_verify', sourceType: 'x',
      headline: 'SPACEX $SPCX HAS REPORTEDLY LINED UP INVESTMENT-GRADE CREDIT RATINGS FROM MOODYS, S&P AND FITCH AHEAD OF ITS IPO',
      publishedAt: now(), firstSeenAt: now(),
    } as CandidateInput, registry, noDupes);
    expect(d.queue).toBe('P1_VERIFY');
  });

  it('stale tier C items still do not surface', () => {
    const old = new Date(Date.now() - 12 * 3600_000).toISOString();
    const d = evaluateCandidate({
      sourceId: 'stockmktnewz', sourceName: 'StockMKTNewz', sourceTier: 'C',
      sourceRoute: 'p1_verify', sourceType: 'x',
      headline: 'SPACEX $SPCX HAS REPORTEDLY LINED UP INVESTMENT-GRADE CREDIT RATINGS FROM MOODYS, S&P AND FITCH AHEAD OF ITS IPO',
      publishedAt: old, firstSeenAt: old,
    } as CandidateInput, registry, noDupes);
    expect(['P2_ROUNDUP', 'MONITORING']).toContain(d.queue);
  });
});

describe('insider buys (was P2 4/10)', () => {
  it('fresh $20M director buy surfaces', () => {
    const d = evaluateCandidate({
      sourceId: 'robinhood-form4', sourceName: 'Robinhood insider filings (SEC)',
      sourceTier: 'A', sourceRoute: 'p0_eligible', sourceType: 'sec_api',
      headline: 'Robinhood Director Malka Meyer buys $20.2M of $HOOD stock in open market (Form 4)',
      publishedAt: now(), firstSeenAt: now(), assetSymbolHint: 'HOOD',
    } as CandidateInput, registry, noDupes);
    expect(['P0_POST_NOW', 'P1_VERIFY']).toContain(d.queue);
  });
});

describe('guardrails: the floor must not break rejection paths', () => {
  it('promo fluff from an official account stays out of P0', () => {
    const d = evaluateCandidate({
      sourceId: 'handle-sofi', sourceName: '@SoFi', sourceTier: 'A',
      sourceRoute: 'p0_eligible', sourceType: 'x',
      headline: 'Why shoot at one goal when you could score on three? You could earn up to $1,400 in bonuses when you bank, invest, and buy crypto with SoFi.',
      publishedAt: now(), firstSeenAt: now(), assetSymbolHint: 'SOFI',
    } as CandidateInput, registry, noDupes);
    expect(d.queue).not.toBe('P0_POST_NOW');
  });

  it('irrelevant content still routes to MONITORING', () => {
    const d = evaluateCandidate({
      sourceId: 'random', sourceName: 'random', sourceTier: 'B',
      sourceRoute: 'p1_verify', sourceType: 'x',
      headline: 'Local bakery wins award for best croissant in Paris neighborhood contest',
      publishedAt: now(), firstSeenAt: now(),
    } as CandidateInput, registry, noDupes);
    expect(['MONITORING', 'REJECTED']).toContain(d.queue);
  });

  it('duplicates still reject', () => {
    const d = evaluateCandidate({
      sourceId: 'coinbase-x-coinbase', sourceName: 'Coinbase (X)', sourceTier: 'A',
      sourceRoute: 'p0_eligible', sourceType: 'x',
      headline: 'Meet Coinbase for Agents. Give your agent its own account to execute trades.',
      publishedAt: now(), firstSeenAt: now(), assetSymbolHint: 'COIN',
    } as CandidateInput, registry, { isDuplicate: () => true });
    expect(d.queue).toBe('REJECTED');
  });
});

describe('noise guards added after replay', () => {
  it('anniversary content never goes P0', () => {
    const d = evaluateCandidate({
      sourceId: 'intel-x-intel', sourceName: 'Intel (X)', sourceTier: 'A',
      sourceRoute: 'p0_eligible', sourceType: 'x',
      headline: '48 years ago this week, Intel introduced a 16-bit microprocessor that would transform personal computing for decades.',
      publishedAt: now(), firstSeenAt: now(), assetSymbolHint: 'INTC',
    } as CandidateInput, registry, noDupes);
    expect(d.queue).not.toBe('P0_POST_NOW');
    expect(d.ttl.category).toBe('commentary');
  });
});
