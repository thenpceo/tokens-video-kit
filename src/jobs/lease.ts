import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

const HOLDER = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

/** Acquire a named lease. Returns false if another holder has it. */
export function acquireLease(db: Database.Database, jobName: string, ttlSeconds: number): boolean {
  const now = new Date();
  const until = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const row = db.prepare('SELECT leased_until, holder FROM job_leases WHERE job_name = ?').get(jobName) as
    | { leased_until: string; holder: string }
    | undefined;
  if (row && row.holder !== HOLDER && new Date(row.leased_until) > now) return false;
  db.prepare(`
    INSERT INTO job_leases (job_name, leased_until, holder) VALUES (?,?,?)
    ON CONFLICT(job_name) DO UPDATE SET leased_until = excluded.leased_until, holder = excluded.holder
  `).run(jobName, until, HOLDER);
  return true;
}

export function releaseLease(db: Database.Database, jobName: string): void {
  db.prepare('DELETE FROM job_leases WHERE job_name = ? AND holder = ?').run(jobName, HOLDER);
}
