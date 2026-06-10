import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function testDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, path.resolve(__dirname, '../migrations'));
  return db;
}

export const REGISTRY_PATH = path.resolve(__dirname, '../config/source-registry.json');
