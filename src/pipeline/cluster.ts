import crypto from 'node:crypto';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by',
  'is', 'are', 'was', 'were', 'be', 'has', 'have', 'had', 'its', 'it', 'as', 'from',
  'that', 'this', 'will', 'after', 'before', 'over', 'under', 'up', 'down', 'new',
  'says', 'said', 'announces', 'announced', 'report', 'reports', 'breaking', 'just',
]);

/**
 * Cluster key: normalized significant tokens of the headline, sorted, hashed.
 * Near-identical headlines from different sources land in the same cluster.
 */
export function clusterKey(headline: string, hint?: string): string {
  const tokens = (hint ? `${headline} ${hint}` : headline)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9$%. ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .sort();
  const distinct = [...new Set(tokens)].slice(0, 12);
  return crypto.createHash('sha1').update(distinct.join('|')).digest('hex').slice(0, 16);
}

export function canonicalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    u.hash = '';
    const strip = [...u.searchParams.keys()].filter((k) =>
      /^(utm_|fbclid|gclid|ref|source|mc_)/i.test(k),
    );
    for (const k of strip) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    let s = u.toString();
    if (s.endsWith('/') && u.pathname === '/' && !u.search) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}
