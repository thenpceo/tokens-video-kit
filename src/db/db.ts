import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getEnv } from '../config/env.js';

let db: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;
  const file = dbPath ?? getEnv().DATABASE_PATH;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

/** Test helper: swap in an isolated database instance. */
export function setDb(instance: Database.Database): void {
  db = instance;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function nowUtc(): string {
  return new Date().toISOString();
}
