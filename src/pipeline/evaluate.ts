import type { SourceRegistry } from '../registry/loadSourceRegistry.js';
import { matchAssets } from './entities.js';
import { classifyCategory, ttlDecision } from './ttl.js';
import { clusterKey } from './cluster.js';
import type {
  CandidateInput, GateResults, MatchedAsset, Queue, RoutingDecision, ScoreBreakdown,
} from './types.js';

const MOVEMENT_STRONG = /\b(acqui(res|sition)|merger|bankrupt|halt(s|ed)?|approv(es|ed|al)|ban(s|ned)?|lawsuit|settle(s|ment)|guidance (raise|cut)|beats|misses|record (high|revenue)|partnership|listing|delist|rate (cut|hike)|etf)\b/i;
const MOVEMENT_MILD = /\b(launch(es|ed)?|expand(s|ed)?|integrat(es|ion)|upgrade(s|d)?|surge(s|d)?|drop(s|ped)?|jump(s|ed)?|fell|rall(y|ied)|milestone)\b/i;
const NUMERIC = /(\$[\d,.]+\s*(billion|million|trillion|[bmk])?|\d+(\.\d+)?%|\d{2,})/i;
const RUMOR = /\b(rumor|reportedly|sources? (say|familiar)|unconfirmed|may be|could be|allegedly|speculat)/i;
const THESIS = /\b(tokenized|tokenization|onchain|on-chain|solana|rwa|stablecoin|xstocks|24\/7 trading|crypto|digital asset)\b/i;

export interface EvaluateOptions {
  /** Returns true when an active cluster already covers this cluster key. */
  isDuplicate: (key: string) => boolean;
  now?: Date;
}

export function scoreCandidate(
  input: CandidateInput,
  matched: MatchedAsset[],
  fresh: boolean,
): ScoreBreakdown {
  const text = `${input.headline} ${input.body ?? ''}`;

  const direct = matched.filter((m) => m.matchType === 'direct' || m.matchType === 'source_default').length;
  const indirect = matched.length - direct;
  const asset_relevance = Math.min(3, direct >= 1 ? 2 + Math.min(1, direct - 1 + (indirect > 0 ? 1 : 0)) : indirect >= 2 ? 2 : indirect === 1 ? 1 : 0);

  const market_movement = MOVEMENT_STRONG.test(text) ? 2 : MOVEMENT_MILD.test(text) ? 1 : 0;

  const numbers = (text.match(NUMERIC) ?? []).length;
  const specificity = Math.min(2, numbers >= 1 ? (text.length > 120 && numbers >= 1 ? 2 : 1) : 0);

  const timeliness = fresh ? 1 : 0;

  const thesis_fit = THESIS.test(text) ? 2 : matched.some((m) => m.matchType === 'topic_rule') ? 1 : 0;

  const total = asset_relevance + market_movement + specificity + timeliness + thesis_fit;
  return { asset_relevance, market_movement, specificity, timeliness, thesis_fit, total };
}

export function evaluateCandidate(
  input: CandidateInput,
  registry: SourceRegistry,
  opts: EvaluateOptions,
): RoutingDecision {
  const now = opts.now ?? new Date();
  const text = `${input.headline} ${input.body ?? ''}`;

  const { matched, ambiguousBlocked } = matchAssets(text, registry, input.assetSymbolHint);
  const category = input.category ?? classifyCategory(text, input.sourceType);
  const ttl = ttlDecision(category, input.publishedAt, input.firstSeenAt, now);
  const key = clusterKey(input.headline, input.clusterKeyHint);
  const duplicate = opts.isDuplicate(key);
  const rumorLike = RUMOR.test(text);
  const officialish = input.sourceTier === 'A';

  const gates: GateResults = {
    trusted_source: {
      pass: input.sourceTier === 'A' || input.sourceTier === 'B',
      detail: `tier ${input.sourceTier}${input.sourceTier === 'C' ? ' (detector-only, needs confirmation)' : ''}`,
    },
    fresh: {
      pass: ttl.fresh,
      detail: `${ttl.ageMinutes}m old, TTL ${ttl.ttlMinutes ?? 'never-P0'} (${category})`,
    },
    relevant: {
      pass: matched.length > 0,
      detail: matched.length
        ? `matched ${matched.map((m) => m.symbol).join(', ')}`
        : ambiguousBlocked.length
          ? `only ambiguous symbols blocked: ${ambiguousBlocked.join(', ')}`
          : 'no asset or thesis match',
    },
    verified: {
      pass: officialish && !rumorLike,
      detail: rumorLike ? 'rumor-like language, needs second source' : officialish ? 'tier A primary source' : 'tier B/C needs confirmation',
    },
    non_duplicate: {
      pass: !duplicate,
      detail: duplicate ? `active cluster ${key} already covers this event` : `new cluster ${key}`,
    },
    draftable: {
      // Material SEC filings are inherently draftable (form + company + link).
      pass:
        input.sourceType === 'sec_api' ||
        (input.headline.length >= 30 && NUMERIC.test(text)) ||
        input.headline.length >= 50,
      detail:
        input.sourceType === 'sec_api'
          ? 'material SEC filing with primary document'
          : 'headline length and factual detail heuristic',
    },
  };

  const score = scoreCandidate(input, matched, ttl.fresh);

  const reasonCodes: string[] = [];
  if (!gates.trusted_source.pass) reasonCodes.push('weak_source');
  if (!gates.verified.pass && gates.trusted_source.pass) reasonCodes.push('needs_confirmation');
  if (!gates.fresh.pass) reasonCodes.push('stale');
  if (duplicate) reasonCodes.push('duplicate');
  if (!gates.relevant.pass && ambiguousBlocked.length > 0) reasonCodes.push('blocked_ambiguous_symbol');
  else if (!gates.relevant.pass) reasonCodes.push('low_asset_relevance');
  if (score.market_movement === 0) reasonCodes.push('low_market_movement');
  if (!gates.draftable.pass) reasonCodes.push('not_draftable');

  const allGatesPass = Object.values(gates).every((g) => g.pass);

  // Registry route caps how high a source can land.
  const route = input.sourceRoute;
  let queue: Queue;

  if (duplicate) {
    queue = 'REJECTED';
  } else if (!gates.relevant.pass) {
    queue = ambiguousBlocked.length > 0 ? 'REJECTED' : 'MONITORING';
  } else if (route === 'monitoring') {
    // Monitoring sources never reach P0, but a fresh near-perfect score
    // escalates to P1_VERIFY so high-value stories are not buried.
    queue = score.total >= 9 && ttl.fresh ? 'P1_VERIFY' : 'MONITORING';
  } else if (allGatesPass && score.total >= 8 && route !== 'p1_verify') {
    // p0_eligible_if_verified / if_official_or_trusted: verified gate already passed here.
    queue = 'P0_POST_NOW';
  } else if (gates.trusted_source.pass && score.total >= 6 && gates.fresh.pass) {
    queue = 'P1_VERIFY';
  } else if (score.total >= 4 || (!gates.fresh.pass && gates.relevant.pass && score.total >= 3)) {
    queue = 'P2_ROUNDUP';
  } else {
    queue = 'MONITORING';
  }

  if (queue !== 'P0_POST_NOW' && reasonCodes.length === 0) {
    reasonCodes.push(score.total < 8 ? 'low_market_movement' : 'needs_confirmation');
  }

  return {
    queue,
    reasonCodes,
    gateResults: gates,
    score,
    matchedAssets: matched,
    ttl,
    clusterKey: key,
    duplicate,
  };
}
