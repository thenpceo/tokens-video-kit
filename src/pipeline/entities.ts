import type { SourceRegistry } from '../registry/loadSourceRegistry.js';
import type { MatchedAsset } from './types.js';

/** Symbols that are common English words; require extra context to match. */
const AMBIGUOUS_SYMBOLS = new Set(['ALL', 'IT', 'ON', 'NOW', 'SO', 'ARE', 'FOR', 'A', 'KEY', 'OPEN', 'REAL', 'PLAY', 'RUN', 'LOVE', 'GOLD', 'USD', 'EUR']);

export interface EntityMatchResult {
  matched: MatchedAsset[];
  ambiguousBlocked: string[];
}

/**
 * Match assets against headline+body using registry asset names, symbols,
 * watch terms, and topic watch rules. Ambiguous bare-symbol matches are
 * blocked unless the asset name or a watch term also appears.
 */
export function matchAssets(
  text: string,
  registry: SourceRegistry,
  assetSymbolHint?: string,
): EntityMatchResult {
  const matched = new Map<string, MatchedAsset>();
  const ambiguousBlocked: string[] = [];
  const lower = text.toLowerCase();

  if (assetSymbolHint) {
    matched.set(assetSymbolHint, { symbol: assetSymbolHint, matchType: 'source_default' });
  }

  for (const a of registry.asset_sources) {
    const nameHit = lower.includes(a.name.toLowerCase());
    const symbolHit = new RegExp(`(^|[^A-Za-z0-9$])\\$?${escapeRe(a.symbol)}([^A-Za-z0-9]|$)`).test(text);
    const termHit = a.watch_terms.some((t) => lower.includes(t.toLowerCase()));

    if (nameHit || (symbolHit && !AMBIGUOUS_SYMBOLS.has(a.symbol.toUpperCase()))) {
      matched.set(a.symbol, { symbol: a.symbol, matchType: 'direct' });
    } else if (symbolHit && AMBIGUOUS_SYMBOLS.has(a.symbol.toUpperCase())) {
      if (termHit || nameHit) {
        matched.set(a.symbol, { symbol: a.symbol, matchType: 'direct' });
      } else {
        ambiguousBlocked.push(a.symbol);
      }
    } else if (termHit) {
      matched.set(a.symbol, { symbol: a.symbol, matchType: 'watch_term' });
    }
  }

  for (const rule of registry.topic_watch_rules) {
    const termHit = rule.terms.some((t) => lower.includes(t.toLowerCase()));
    if (termHit) {
      for (const symbol of rule.assets) {
        if (!matched.has(symbol)) {
          matched.set(symbol, { symbol, matchType: 'topic_rule' });
        }
      }
    }
  }

  return { matched: [...matched.values()], ambiguousBlocked };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
