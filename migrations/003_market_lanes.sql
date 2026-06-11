-- Phase A: market-data lanes (movers, ratings, macro prints, insider buys).

-- One row per symbol per UTC day; tracks the largest |%| move already
-- alerted so the same move does not re-alert every poll.
CREATE TABLE IF NOT EXISTS market_move_alerts (
  symbol TEXT NOT NULL,
  day TEXT NOT NULL,
  last_alerted_pct REAL NOT NULL,
  PRIMARY KEY (symbol, day)
);

-- Benzinga/economics/ratings items already emitted (dedupe by provider id).
CREATE TABLE IF NOT EXISTS data_lane_emitted (
  lane TEXT NOT NULL,
  external_id TEXT NOT NULL,
  emitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (lane, external_id)
);
