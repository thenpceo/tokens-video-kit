import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { testDb, REGISTRY_PATH } from './helpers.js';
import { loadSourceRegistry } from '../src/registry/loadSourceRegistry.js';
import { evaluateCandidate } from '../src/pipeline/evaluate.js';
import { hasActiveCluster, storeCandidate, storeRawEvent } from '../src/pipeline/persist.js';
import { parseFeed } from '../src/ingest/rss.js';
import { clusterKey, canonicalizeUrl } from '../src/pipeline/cluster.js';
import { computeSourceScore } from '../src/scoring/sourceScores.js';
import type { CandidateInput } from '../src/pipeline/types.js';

const registry = loadSourceRegistry(REGISTRY_PATH);
let db: Database.Database;

beforeEach(() => {
  db = testDb();
});

function input(headline: string, extra: Partial<CandidateInput> = {}): CandidateInput {
  return {
    sourceId: 'nvidia-rss', sourceName: 'NVIDIA feed', sourceTier: 'A',
    sourceRoute: 'p0_eligible', sourceType: 'rss', headline,
    url: `https://example.com/${encodeURIComponent(headline.slice(0, 20))}`,
    firstSeenAt: new Date().toISOString(), publishedAt: new Date().toISOString(),
    assetSymbolHint: 'NVDA', ...extra,
  };
}

describe('pipeline persistence', () => {
  it('stores candidate with full decision trace', () => {
    const inp = input('NVIDIA announces $50 billion partnership with Microsoft for Blackwell GPUs');
    const decision = evaluateCandidate(inp, registry, { isDuplicate: (k) => hasActiveCluster(db, k) });
    const raw = storeRawEvent(db, inp, { test: true }, 200, 'hash');
    const stored = storeCandidate(db, inp, decision, raw);
    expect(stored).not.toBeNull();
    const trace = db.prepare('SELECT * FROM decision_traces WHERE candidate_id = ?').get(stored!.candidateId) as any;
    expect(trace).toBeTruthy();
    const gates = JSON.parse(trace.gate_results);
    expect(gates.trusted_source.pass).toBe(true);
    expect(JSON.parse(trace.routing_result).queue).toBe(decision.queue);
  });

  it('same headline from second source joins cluster and is marked duplicate', () => {
    const first = input('Coinbase launches tokenized stock trading for European Union users today');
    const d1 = evaluateCandidate(first, registry, { isDuplicate: (k) => hasActiveCluster(db, k) });
    storeCandidate(db, first, d1, storeRawEvent(db, first, {}, 200, 'h1'));

    const second = input('Coinbase launches tokenized stock trading for European Union users today', {
      sourceId: 'blockworks', url: 'https://other.com/article',
    });
    const d2 = evaluateCandidate(second, registry, { isDuplicate: (k) => hasActiveCluster(db, k) });
    expect(d2.duplicate).toBe(true);
    expect(d2.queue).toBe('REJECTED');
  });

  it('exact canonical URL is ingested only once', () => {
    const inp = input('NVIDIA ships new Blackwell GPU with 30% performance gain over Hopper');
    expect(storeRawEvent(db, inp, {}, 200, 'h')).not.toBeNull();
    expect(storeRawEvent(db, inp, {}, 200, 'h')).toBeNull();
  });
});

describe('rss parsing', () => {
  it('parses RSS 2.0', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title>Hello World</title><link>https://a.com/1</link><pubDate>Tue, 10 Jun 2026 12:00:00 GMT</pubDate><description>Body &lt;b&gt;here&lt;/b&gt;</description></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe('Hello World');
    expect(items[0]!.publishedAt).toBe('2026-06-10T12:00:00.000Z');
  });

  it('parses Atom', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Atom Entry</title><link rel="alternate" href="https://a.com/2"/><published>2026-06-10T10:00:00Z</published><id>id-1</id></entry>
    </feed>`;
    const items = parseFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.link).toBe('https://a.com/2');
  });

  it('throws on garbage so parse failures become health events', () => {
    expect(() => parseFeed('{"not":"xml"}')).toThrow();
  });
});

describe('clustering', () => {
  it('near-identical headlines share a cluster key', () => {
    const a = clusterKey('NVIDIA announces $50B partnership with Microsoft');
    const b = clusterKey('NVIDIA Announces $50B Partnership With Microsoft!');
    expect(a).toBe(b);
  });

  it('different events get different keys', () => {
    const a = clusterKey('NVIDIA announces $50B partnership with Microsoft');
    const b = clusterKey('Tesla recalls 100,000 vehicles over autopilot issue');
    expect(a).not.toBe(b);
  });

  it('canonicalizes URLs by stripping tracking params', () => {
    expect(canonicalizeUrl('https://www.Example.com/a/?utm_source=x&id=5')).toBe('https://example.com/a?id=5');
  });
});

describe('source scoring', () => {
  it('reports insufficient data under 10 ratings', () => {
    const row = computeSourceScore(db, 'nvidia-rss', '7d');
    expect(row.state).toBe('insufficient_data');
  });

  it('computes quality score from votes', () => {
    const inp = input('NVIDIA announces $50 billion partnership with Microsoft for Blackwell GPUs');
    const d = evaluateCandidate(inp, registry, { isDuplicate: () => false });
    const stored = storeCandidate(db, inp, d, null)!;
    for (let i = 0; i < 12; i++) {
      db.prepare('INSERT INTO feedback_votes (candidate_id, user_id, label) VALUES (?,?,?)')
        .run(stored.candidateId, `U${i}`, i < 10 ? 'post_worthy' : 'useful');
    }
    const row = computeSourceScore(db, 'nvidia-rss', '7d');
    expect(row.qualityScore).toBe(100); // 50 + (10*3+2)*5 clamped
    expect(row.state).toBe('boost');
  });
});
