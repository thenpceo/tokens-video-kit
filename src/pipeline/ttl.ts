import type { TtlCategory } from './types.js';

/** P0 freshness windows in minutes, per plan TTL table. null = never P0. */
export const TTL_MINUTES: Record<TtlCategory, number | null> = {
  breaking_macro: 15,
  sec_material_filing: 60,
  official_launch: 45,
  tokenized_market_structure: 180,
  onchain_metric_milestone: 360,
  market_move: 30,
  analyst_rating: 120,
  commentary: null,
};

const CATEGORY_HINTS: Array<{ category: TtlCategory; pattern: RegExp }> = [
  { category: 'sec_material_filing', pattern: /\b(8-K|S-1|F-1|424B|10-Q|10-K|form 4|sec filing|prospectus)\b/i },
  { category: 'breaking_macro', pattern: /\b(CPI|PPI|nonfarm|jobs report|fed (cuts|hikes|holds)|rate (cut|hike)|FOMC|tariff|ceasefire|GDP)\b/i },
  { category: 'tokenized_market_structure', pattern: /\b(tokenized|xStocks|RWA|onchain (fund|treasury)|stablecoin|24\/7 trading|tokenization)\b/i },
  { category: 'onchain_metric_milestone', pattern: /\b(TVL|all-time high|milestone|surpass(es|ed)?|crosses) \$?[\d,.]+[BMK]?\b/i },
  { category: 'official_launch', pattern: /\b(launch(es|ed)?|partner(ship|s with)|announc(es|ed)|unveil(s|ed)?|introduc(es|ed)|acqui(res|sition)|integrat(es|ion))\b/i },
];

export function classifyCategory(text: string, sourceType: string): TtlCategory {
  if (sourceType === 'sec_api' || sourceType === 'sec_rss') return 'sec_material_filing';
  if (sourceType === 'government_macro' || sourceType === 'macro_data') return 'breaking_macro';
  if (sourceType === 'market_data') return 'market_move';
  if (sourceType === 'analyst_rating') return 'analyst_rating';
  for (const { category, pattern } of CATEGORY_HINTS) {
    if (pattern.test(text)) return category;
  }
  return 'commentary';
}

export function ttlDecision(
  category: TtlCategory,
  publishedAt: string | undefined,
  firstSeenAt: string,
  now: Date = new Date(),
): { category: TtlCategory; ttlMinutes: number | null; ageMinutes: number; fresh: boolean } {
  const basis = publishedAt ?? firstSeenAt;
  const ageMinutes = Math.max(0, (now.getTime() - new Date(basis).getTime()) / 60_000);
  const ttlMinutes = TTL_MINUTES[category];
  const fresh = ttlMinutes !== null && ageMinutes <= ttlMinutes;
  return { category, ttlMinutes, ageMinutes: Math.round(ageMinutes), fresh };
}
