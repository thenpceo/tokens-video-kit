import fs from 'node:fs';
import { z } from 'zod';
import { getEnv } from '../config/env.js';

const Tier = z.enum(['A', 'B', 'C']);
const Route = z.enum([
  'p0_eligible',
  'p0_eligible_if_verified',
  'p0_eligible_if_official_or_trusted',
  'p1_verify',
  'monitoring',
]);

const XHandleSource = z.object({
  handle: z.string(),
  tier: Tier,
  route: Route,
  reason: z.string().optional(),
});

const GlobalSource = z.object({
  id: z.string(),
  name: z.string(),
  tier: Tier,
  source_type: z.string(),
  url: z.string().optional(),
  url_template: z.string().optional(),
  x_handle: z.string().optional(),
  poll_interval_minutes: z.number().optional(),
  categories: z.array(z.string()).default([]),
  route: Route,
  watch_rules: z.array(z.string()).optional(),
});

const EcosystemSource = z.object({
  id: z.string(),
  name: z.string(),
  tier: Tier,
  x_handle: z.string().optional(),
  alternate_handles: z.array(z.string()).optional(),
  url: z.string().optional(),
  rss_url: z.string().optional(),
  categories: z.array(z.string()).default([]),
  route: Route,
});

const AssetSource = z.object({
  asset_id: z.string(),
  symbol: z.string(),
  name: z.string(),
  tier: z.string(),
  x_handles: z.array(z.string()).default([]),
  primary_urls: z.array(z.string()).default([]),
  rss_urls: z.array(z.string()).optional(),
  sec_cik: z.string().nullable().optional(),
  categories: z.array(z.string()).default([]),
  watch_terms: z.array(z.string()).default([]),
  bridge_allowed: z.boolean().optional(),
  route: Route,
});

const FastDetectorSource = z.object({
  id: z.string(),
  name: z.string(),
  tier: Tier,
  source_type: z.string(),
  x_handle: z.string().optional(),
  route: Route,
  reason: z.string().optional(),
});

const TopicWatchRule = z.object({
  id: z.string(),
  priority: z.string(),
  route: Route,
  terms: z.array(z.string()),
  assets: z.array(z.string()),
});

const RegistrySchema = z.object({
  version: z.number(),
  generated_at: z.string(),
  goal: z.string(),
  routing_policy: z.record(z.string()),
  trust_tiers: z.record(z.any()),
  provided_x_handles: z.array(XHandleSource),
  global_sources: z.array(GlobalSource),
  ecosystem_sources: z.array(EcosystemSource),
  asset_sources: z.array(AssetSource),
  fast_detector_sources: z.array(FastDetectorSource),
  topic_watch_rules: z.array(TopicWatchRule),
  disallowed_green_queue_rules: z.array(z.string()),
});

export type SourceRegistry = z.infer<typeof RegistrySchema>;
export type AssetSourceEntry = z.infer<typeof AssetSource>;
export type RegistryRoute = z.infer<typeof Route>;
export type SourceTier = z.infer<typeof Tier>;

/** A flattened pollable source the connectors iterate over. */
export interface PollableSource {
  sourceId: string;
  name: string;
  tier: SourceTier;
  route: RegistryRoute;
  kind: 'rss' | 'sec_api' | 'sec_rss' | 'page' | 'x';
  url?: string;
  xHandle?: string;
  cik?: string;
  categories: string[];
  watchTerms: string[];
  pollIntervalMinutes: number;
  assetSymbol?: string;
}

let cached: SourceRegistry | null = null;

export function loadSourceRegistry(registryPath?: string): SourceRegistry {
  if (cached && !registryPath) return cached;
  const p = registryPath ?? getEnv().SOURCE_REGISTRY_PATH;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const parsed = RegistrySchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid source registry at ${p}: ${issues}`);
  }
  if (!registryPath) cached = parsed.data;
  return parsed.data;
}

function looksLikeFeed(url: string): boolean {
  return /rss|atom|feed|\.xml/i.test(url);
}

/**
 * Flatten the registry into pollable sources for v1 connectors:
 * RSS-ish primary URLs, SEC submissions per CIK, and X handles
 * (X is consumed only when an X connector is enabled).
 */
export function pollableSources(registry: SourceRegistry): PollableSource[] {
  const out: PollableSource[] = [];

  for (const g of registry.global_sources) {
    if (g.source_type === 'rss' && g.url && !g.url_template) {
      out.push({
        sourceId: g.id, name: g.name, tier: g.tier, route: g.route,
        kind: 'rss', url: g.url, categories: g.categories,
        watchTerms: g.watch_rules ?? [], pollIntervalMinutes: g.poll_interval_minutes ?? 10,
      });
    }
  }

  for (const e of registry.ecosystem_sources) {
    const feed = e.rss_url ?? (e.url && looksLikeFeed(e.url) ? e.url : undefined);
    if (feed) {
      out.push({
        sourceId: e.id, name: e.name, tier: e.tier, route: e.route,
        kind: 'rss', url: feed, categories: e.categories,
        watchTerms: [], pollIntervalMinutes: 10,
      });
    }
    if (e.x_handle) {
      out.push({
        sourceId: `${e.id}-x`, name: `${e.name} (X)`, tier: e.tier, route: e.route,
        kind: 'x', xHandle: e.x_handle, categories: e.categories,
        watchTerms: [], pollIntervalMinutes: 15,
      });
    }
  }

  for (const a of registry.asset_sources) {
    const feeds = [...(a.rss_urls ?? []), ...a.primary_urls.filter(looksLikeFeed)];
    for (const [i, feed] of feeds.entries()) {
      out.push({
        sourceId: `${a.asset_id}-rss${i ? `-${i}` : ''}`, name: `${a.name} feed`,
        tier: 'A', route: a.route, kind: 'rss', url: feed,
        categories: a.categories, watchTerms: a.watch_terms,
        pollIntervalMinutes: 15, assetSymbol: a.symbol,
      });
    }
    if (a.sec_cik) {
      out.push({
        sourceId: `${a.asset_id}-sec`, name: `${a.name} SEC filings`,
        tier: 'A', route: a.route, kind: 'sec_api', cik: a.sec_cik,
        categories: ['earnings_guidance_financials', 'legal_regulatory'],
        watchTerms: a.watch_terms, pollIntervalMinutes: 10, assetSymbol: a.symbol,
      });
    }
    for (const handle of a.x_handles) {
      out.push({
        sourceId: `${a.asset_id}-x-${handle.toLowerCase()}`, name: `${a.name} (X @${handle})`,
        tier: 'A', route: a.route, kind: 'x', xHandle: handle,
        categories: a.categories, watchTerms: a.watch_terms,
        pollIntervalMinutes: 15, assetSymbol: a.symbol,
      });
    }
  }

  for (const h of registry.provided_x_handles) {
    out.push({
      sourceId: `handle-${h.handle.toLowerCase()}`, name: `@${h.handle}`,
      tier: h.tier, route: h.route, kind: 'x', xHandle: h.handle,
      categories: [], watchTerms: [], pollIntervalMinutes: 15,
    });
  }

  for (const d of registry.fast_detector_sources) {
    if (d.x_handle) {
      out.push({
        sourceId: d.id, name: d.name, tier: d.tier, route: d.route,
        kind: 'x', xHandle: d.x_handle, categories: [], watchTerms: [],
        pollIntervalMinutes: 10,
      });
    }
  }

  // De-dupe by sourceId (asset x_handles can also appear in provided_x_handles).
  const seen = new Set<string>();
  return out.filter((s) => {
    const key = s.kind === 'x' ? `x:${s.xHandle?.toLowerCase()}` : s.sourceId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
