import type Database from 'better-sqlite3';
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
