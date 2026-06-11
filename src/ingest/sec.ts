import type Database from 'better-sqlite3';
import { XMLParser } from 'fast-xml-parser';
import { fetchWithHealth, recordHealth } from './http.js';
import { getEnv } from '../config/env.js';

export interface SecFiling {
  form: string;
  accessionNumber: string;
  filingDate: string;
  primaryDocDescription?: string;
  url: string;
  title: string;
}

const MATERIAL_FORMS = new Set(['8-K', 'S-1', 'F-1', '10-Q', '10-K', '424B1', '424B2', '424B3', '424B4', '424B5', '6-K']);

/** Minimum open-market purchase value for a Form 4 to become a candidate. */
export const FORM4_MIN_BUY_USD = 2_000_000;

export interface InsiderBuy {
  accessionNumber: string;
  ownerName: string;
  ownerRole: string;
  totalValue: number;
  shares: number;
  filedDate: string;
  url: string;
  headline: string;
}

/** Fetch recent filings for a CIK from the SEC submissions API. */
export async function fetchSecFilings(
  db: Database.Database,
  sourceId: string,
  cik: string,
  companyName: string,
): Promise<SecFiling[]> {
  const cik10 = cik.padStart(10, '0');
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const res = await fetchWithHealth(db, sourceId, url, {
    'User-Agent': getEnv().SEC_USER_AGENT,
    Accept: 'application/json',
  });
  if (!res.ok) return [];

  try {
    const data = JSON.parse(res.body);
    const recent = data?.filings?.recent;
    if (!recent?.form) return [];
    const out: SecFiling[] = [];
    const n = Math.min(recent.form.length, 25);
    for (let i = 0; i < n; i++) {
      const form: string = recent.form[i];
      const base = form.split('/')[0] ?? form;
      if (!MATERIAL_FORMS.has(base) && !MATERIAL_FORMS.has(form)) continue;
      const accession: string = recent.accessionNumber[i];
      const accessionClean = accession.replace(/-/g, '');
      const primaryDoc: string = recent.primaryDocument?.[i] ?? '';
      out.push({
        form,
        accessionNumber: accession,
        filingDate: recent.filingDate[i],
        primaryDocDescription: recent.primaryDocDescription?.[i] || undefined,
        url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionClean}/${primaryDoc}`,
        title: `${companyName} files ${form}${
          recent.primaryDocDescription?.[i] && recent.primaryDocDescription[i] !== form
            ? `: ${recent.primaryDocDescription[i]}`
            : ''
        } (${recent.filingDate[i]})`,
      });
    }
    return out;
  } catch (err) {
    recordHealth(db, sourceId, 'parse_failed', res.status, err instanceof Error ? err.message : String(err));
    return [];
  }
}

const xmlParser = new XMLParser({ ignoreAttributes: true, trimValues: true });

function num(v: unknown): number {
  if (v && typeof v === 'object' && 'value' in (v as any)) return Number((v as any).value) || 0;
  return Number(v) || 0;
}

function arr<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Parse a Form 4 XML document; returns open-market purchase totals (code P). */
export function parseForm4Purchases(xml: string): { ownerName: string; ownerRole: string; shares: number; value: number } | null {
  const doc = xmlParser.parse(xml)?.ownershipDocument;
  if (!doc) return null;
  const owner = arr(doc.reportingOwner)[0] as any;
  const ownerName = String(owner?.reportingOwnerId?.rptOwnerName ?? 'Insider');
  const rel = owner?.reportingOwnerRelationship ?? {};
  const ownerRole = rel.officerTitle
    ? String(rel.officerTitle)
    : num(rel.isDirector) === 1 || rel.isDirector === 'true' || rel.isDirector === true ? 'Director'
    : num(rel.isTenPercentOwner) === 1 ? '10% owner'
    : 'Insider';

  let shares = 0;
  let value = 0;
  for (const t of arr(doc.nonDerivativeTable?.nonDerivativeTransaction) as any[]) {
    const code = t?.transactionCoding?.transactionCode;
    const acqDispRaw = t?.transactionAmounts?.transactionAcquiredDisposedCode;
    const acqDisp = acqDispRaw && typeof acqDispRaw === 'object' ? (acqDispRaw as any).value : acqDispRaw;
    if (code !== 'P' || (acqDisp && acqDisp !== 'A')) continue; // open-market purchases only
    const s = num(t?.transactionAmounts?.transactionShares);
    const p = num(t?.transactionAmounts?.transactionPricePerShare);
    shares += s;
    value += s * p;
  }
  if (value <= 0) return null;
  return { ownerName, ownerRole, shares, value };
}

/** Scan recent Form 4 filings for large open-market insider buys. */
export async function fetchInsiderBuys(
  db: Database.Database,
  sourceId: string,
  cik: string,
  companyName: string,
  symbol: string | undefined,
  maxToInspect = 3,
): Promise<InsiderBuy[]> {
  const cik10 = cik.padStart(10, '0');
  const res = await fetchWithHealth(db, sourceId, `https://data.sec.gov/submissions/CIK${cik10}.json`, {
    'User-Agent': getEnv().SEC_USER_AGENT,
    Accept: 'application/json',
  });
  if (!res.ok) return [];

  const out: InsiderBuy[] = [];
  try {
    const recent = JSON.parse(res.body)?.filings?.recent;
    if (!recent?.form) return [];
    const cutoff = new Date(Date.now() - 3 * 24 * 3600_000).toISOString().slice(0, 10);
    let inspected = 0;
    for (let i = 0; i < recent.form.length && inspected < maxToInspect; i++) {
      if (recent.form[i] !== '4' || recent.filingDate[i] < cutoff) continue;
      inspected++;
      const accession: string = recent.accessionNumber[i];
      // primaryDocument may be wrapped in an XSL render path; the raw XML is the basename.
      const rawDoc = String(recent.primaryDocument?.[i] ?? '').split('/').pop() ?? '';
      if (!rawDoc.endsWith('.xml')) continue;
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}/${rawDoc}`;
      const docRes = await fetchWithHealth(db, sourceId, docUrl, { 'User-Agent': getEnv().SEC_USER_AGENT });
      if (!docRes.ok) continue;
      const parsed = parseForm4Purchases(docRes.body);
      if (!parsed || parsed.value < FORM4_MIN_BUY_USD) continue;
      const valueStr = parsed.value >= 1e6 ? `$${(parsed.value / 1e6).toFixed(1)}M` : `$${Math.round(parsed.value / 1e3)}K`;
      out.push({
        accessionNumber: accession,
        ownerName: parsed.ownerName,
        ownerRole: parsed.ownerRole,
        totalValue: parsed.value,
        shares: parsed.shares,
        filedDate: recent.filingDate[i],
        url: docUrl,
        headline: `${companyName} ${parsed.ownerRole} ${parsed.ownerName} buys ${valueStr} of ${symbol ? `$${symbol}` : 'company'} stock in open market (Form 4)`,
      });
    }
  } catch (err) {
    recordHealth(db, sourceId, 'parse_failed', res.status, err instanceof Error ? err.message : String(err));
  }
  return out;
}
