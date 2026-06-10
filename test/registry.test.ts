import { describe, expect, it } from 'vitest';
import { loadSourceRegistry, pollableSources } from '../src/registry/loadSourceRegistry.js';
import { REGISTRY_PATH } from './helpers.js';

describe('source registry', () => {
  it('loads and validates the real registry', () => {
    const reg = loadSourceRegistry(REGISTRY_PATH);
    expect(reg.version).toBe(1);
    expect(reg.asset_sources.length).toBeGreaterThan(10);
    expect(reg.provided_x_handles.length).toBeGreaterThan(10);
  });

  it('flattens into pollable sources with SEC + RSS + X kinds', () => {
    const reg = loadSourceRegistry(REGISTRY_PATH);
    const sources = pollableSources(reg);
    const kinds = new Set(sources.map((s) => s.kind));
    expect(kinds.has('sec_api')).toBe(true);
    expect(kinds.has('x')).toBe(true);
    const ids = sources.map((s) => s.sourceId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
    // every source has a route the router understands
    for (const s of sources) {
      expect(['p0_eligible', 'p0_eligible_if_verified', 'p0_eligible_if_official_or_trusted', 'p1_verify', 'monitoring']).toContain(s.route);
    }
  });
});
