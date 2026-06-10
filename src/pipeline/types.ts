import type { RegistryRoute, SourceTier } from '../registry/loadSourceRegistry.js';

export type Queue = 'P0_POST_NOW' | 'P1_VERIFY' | 'P2_ROUNDUP' | 'MONITORING' | 'REJECTED';

export type TtlCategory =
  | 'breaking_macro'
  | 'sec_material_filing'
  | 'official_launch'
  | 'tokenized_market_structure'
  | 'onchain_metric_milestone'
  | 'commentary';

export interface MatchedAsset {
  symbol: string;
  matchType: 'direct' | 'watch_term' | 'topic_rule' | 'source_default';
}

export interface CandidateInput {
  sourceId: string;
  sourceName: string;
  sourceTier: SourceTier;
  sourceRoute: RegistryRoute;
  sourceType: string;
  headline: string;
  body?: string;
  url?: string;
  canonicalUrl?: string;
  publishedAt?: string; // UTC ISO
  firstSeenAt: string;  // UTC ISO
  category?: TtlCategory;
  assetSymbolHint?: string;
  /** Extra discriminator mixed into the cluster key (e.g. SEC accession number). */
  clusterKeyHint?: string;
}

export interface GateResult {
  pass: boolean;
  detail: string;
}

export interface GateResults {
  trusted_source: GateResult;
  fresh: GateResult;
  relevant: GateResult;
  verified: GateResult;
  non_duplicate: GateResult;
  draftable: GateResult;
}

export interface ScoreBreakdown {
  asset_relevance: number;        // 0-3
  market_movement: number;        // 0-2
  specificity: number;            // 0-2
  timeliness: number;             // 0-1
  thesis_fit: number;             // 0-2
  total: number;                  // 0-10
}

export interface RoutingDecision {
  queue: Queue;
  reasonCodes: string[];
  gateResults: GateResults;
  score: ScoreBreakdown;
  matchedAssets: MatchedAsset[];
  ttl: { category: TtlCategory; ttlMinutes: number | null; ageMinutes: number; fresh: boolean };
  clusterKey: string;
  duplicate: boolean;
}
