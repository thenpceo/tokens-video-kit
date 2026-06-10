import { XMLParser } from 'fast-xml-parser';

export interface FeedItem {
  title: string;
  link?: string;
  description?: string;
  publishedAt?: string; // UTC ISO
  guid?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text']);
  }
  return undefined;
}

function isoDate(v: unknown): string | undefined {
  const s = text(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Parse RSS 2.0 or Atom into normalized items. Throws on unparseable XML. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml);

  // RSS 2.0
  const channel = doc?.rss?.channel;
  if (channel) {
    return toArray(channel.item).map((item: any) => ({
      title: text(item.title) ?? '',
      link: text(item.link),
      description: stripHtml(text(item.description)),
      publishedAt: isoDate(item.pubDate) ?? isoDate(item['dc:date']),
      guid: text(item.guid),
    })).filter((i: FeedItem) => i.title);
  }

  // Atom
  const feed = doc?.feed;
  if (feed) {
    return toArray(feed.entry).map((entry: any) => {
      const links = toArray(entry.link);
      const alt = links.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']) ?? links[0];
      return {
        title: text(entry.title) ?? '',
        link: alt ? (alt as any)['@_href'] : undefined,
        description: stripHtml(text(entry.summary) ?? text(entry.content)),
        publishedAt: isoDate(entry.published) ?? isoDate(entry.updated),
        guid: text(entry.id),
      };
    }).filter((i: FeedItem) => i.title);
  }

  throw new Error('Unrecognized feed format (no rss.channel or feed root)');
}

function stripHtml(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
