import { describe, expect, it } from 'vitest';
import { evaluateCandidate } from '../src/pipeline/evaluate.js';
import { loadSourceRegistry } from '../src/registry/loadSourceRegistry.js';
import type { CandidateInput } from '../src/pipeline/types.js';
import { REGISTRY_PATH } from './helpers.js';

const registry = loadSourceRegistry(REGISTRY_PATH);
const noDupes = { isDuplicate: () => false };

function candidate(overrides: Partial<CandidateInput>): CandidateInput {
  return {
    sourceId: 'nvidia-rss',
    sourceName: 'NVIDIA feed',
    sourceTier: 'A',
    sourceRoute: 'p0_eligible',
    sourceType: 'rss',
    headline: 'placeholder',
    firstSeenAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('routing', () => {
  it('routes a fresh, official, high-score launch to P0', () => {
    const decision = evaluateCandidate(
      candidate({
        headline: 'NVIDIA announces $50 billion data center partnership with Microsoft for Blackwell GPU deployment',
        body: 'NVIDIA and Microsoft announced a $50 billion multi-year agreement covering 2 million Blackwell GPUs for AI infrastructure.',
        assetSymbolHint: 'NVDA',
      }),
      registry,
      noDupes,
    );
    expect(decision.queue).toBe('P0_POST_NOW');
    expect(decision.score.total).toBeGreaterThanOrEqual(8);
  });

  it('never routes tier C detectors to P0', () => {
    const decision = evaluateCandidate(
      candidate({
        sourceId: 'deitaone',
        sourceTier: 'C',
        sourceRoute: 'p1_verify',
        headline: 'NVIDIA announces $50 billion data center partnership with Microsoft for Blackwell GPU deployment',
        assetSymbolHint: 'NVDA',
      }),
      registry,
      noDupes,
    );
    expect(decision.queue).not.toBe('P0_POST_NOW');
    expect(decision.reasonCodes).toContain('weak_source');
  });

  it('stale items fall out of P0 with a stale reason', () => {
    const old = new Date(Date.now() - 6 * 3600_000).toISOString();
    const decision = evaluateCandidate(
      candidate({
        headline: 'NVIDIA announces $50 billion data center partnership with Microsoft for Blackwell GPU deployment',
        publishedAt: old,
        assetSymbolHint: 'NVDA',
      }),
      registry,
      noDupes,
    );
    expect(decision.queue).not.toBe('P0_POST_NOW');
    expect(decision.reasonCodes).toContain('stale');
  });

  it('duplicates are rejected with reason', () => {
    const decision = evaluateCandidate(
      candidate({
        headline: 'NVIDIA announces $50 billion data center partnership with Microsoft',
        assetSymbolHint: 'NVDA',
      }),
      registry,
      { isDuplicate: () => true },
    );
    expect(decision.queue).toBe('REJECTED');
    expect(decision.reasonCodes).toContain('duplicate');
  });

  it('rumor-like language fails verification and cannot reach P0', () => {
    const decision = evaluateCandidate(
      candidate({
        headline: 'NVIDIA reportedly in talks for $30 billion acquisition of AI startup, sources say',
        assetSymbolHint: 'NVDA',
      }),
      registry,
      noDupes,
    );
    expect(decision.queue).not.toBe('P0_POST_NOW');
    expect(decision.reasonCodes).toContain('needs_confirmation');
  });

  it('irrelevant items go to MONITORING', () => {
    const decision = evaluateCandidate(
      candidate({
        sourceId: 'random',
        sourceRoute: 'monitoring',
        headline: 'Local bakery wins award for best croissant in Paris neighborhood contest',
        assetSymbolHint: undefined,
      }),
      registry,
      noDupes,
    );
    expect(['MONITORING', 'REJECTED']).toContain(decision.queue);
  });

  it('every non-P0 decision carries at least one reason code', () => {
    const decision = evaluateCandidate(
      candidate({
        headline: 'Solana network update improves validator performance metrics slightly',
        sourceRoute: 'p1_verify',
        sourceTier: 'B',
      }),
      registry,
      noDupes,
    );
    expect(decision.queue).not.toBe('P0_POST_NOW');
    expect(decision.reasonCodes.length).toBeGreaterThan(0);
  });
});
