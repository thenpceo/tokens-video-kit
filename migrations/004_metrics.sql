-- Phase C: metric snapshots for milestone detection and future INSIGHT posts.
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_id TEXT NOT NULL,           -- e.g. price:BTC, mcap:SOL
  value REAL NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots ON metric_snapshots(metric_id, captured_at);
