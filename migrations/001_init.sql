-- Core schema for the Tokens postability engine.
-- All timestamps are UTC ISO-8601 strings.

CREATE TABLE IF NOT EXISTS raw_ingest_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  published_at TEXT,
  http_status INTEGER,
  response_hash TEXT,
  parse_status TEXT NOT NULL DEFAULT 'ok', -- ok | parse_failed | empty
  payload TEXT NOT NULL,                   -- raw item JSON
  canonical_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_raw_source ON raw_ingest_events(source_id, fetched_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_canonical ON raw_ingest_events(source_id, canonical_url)
  WHERE canonical_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_key TEXT NOT NULL UNIQUE,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  headline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'    -- active | expired | posted
);

CREATE TABLE IF NOT EXISTS normalized_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_event_id INTEGER REFERENCES raw_ingest_events(id),
  cluster_id INTEGER REFERENCES event_clusters(id),
  source_id TEXT NOT NULL,
  source_tier TEXT NOT NULL,               -- A | B | C
  source_route TEXT NOT NULL,              -- registry route
  headline TEXT NOT NULL,
  body TEXT,
  url TEXT,
  canonical_url TEXT,
  published_at TEXT,
  first_seen_at TEXT NOT NULL,
  category TEXT,                           -- TTL category
  matched_assets TEXT,                     -- JSON array of {symbol, match_type}
  queue TEXT,                              -- P0_POST_NOW | P1_VERIFY | P2_ROUNDUP | MONITORING | REJECTED
  reason_codes TEXT,                       -- JSON array of automated reasons
  editorial_score INTEGER,
  score_breakdown TEXT,                    -- JSON object
  status TEXT NOT NULL DEFAULT 'new',      -- new | sent | approved | rewrite | skipped | posted | rejected
  draft_copy TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_cand_queue ON normalized_candidates(queue, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cand_canonical ON normalized_candidates(canonical_url)
  WHERE canonical_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS decision_traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES normalized_candidates(id),
  gate_results TEXT NOT NULL,              -- JSON {gate: {pass, detail}}
  score_breakdown TEXT NOT NULL,           -- JSON
  matched_entities TEXT,                   -- JSON
  ttl_decision TEXT,                       -- JSON {category, ttl_minutes, age_minutes, fresh}
  dedupe_result TEXT,                      -- JSON {cluster_key, duplicate}
  routing_result TEXT NOT NULL,            -- JSON {queue, reasons}
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_trace_candidate ON decision_traces(candidate_id);

CREATE TABLE IF NOT EXISTS slack_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES normalized_candidates(id),
  channel TEXT,
  message_ts TEXT,
  delivery TEXT NOT NULL,                  -- webhook | bot
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_slackmsg_candidate ON slack_messages(candidate_id);

CREATE TABLE IF NOT EXISTS slack_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,    -- candidate|cluster|ts|action|user
  candidate_id INTEGER NOT NULL,
  action_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS feedback_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES normalized_candidates(id),
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,                     -- post_worthy | useful | who_cares | duplicate | stale | bad_source | wrong_fit
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(candidate_id, user_id)            -- latest rating per user wins via upsert
);

CREATE TABLE IF NOT EXISTS source_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  window TEXT NOT NULL,                    -- 24h | 7d | 30d
  computed_at TEXT NOT NULL,
  inputs TEXT NOT NULL,                    -- JSON counts
  quality_score INTEGER,
  state TEXT NOT NULL,                     -- insufficient_data | boost | maintain | demote | removal_review
  UNIQUE(source_id, window, computed_at)
);

CREATE TABLE IF NOT EXISTS source_health_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,                -- success | http_error | parse_failed | rate_limited | auth_failed | quiet_period
  http_status INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_health_source ON source_health_events(source_id, created_at);

CREATE TABLE IF NOT EXISTS source_health_state (
  source_id TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_error_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_http_status INTEGER,
  rate_limited INTEGER NOT NULL DEFAULT 0,
  stale_polling INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS copy_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES normalized_candidates(id),
  draft_copy TEXT,
  approved_copy TEXT,
  posted_copy TEXT,
  hook_label TEXT,
  bridge_line TEXT,
  source_framing TEXT,
  character_count INTEGER,
  editor_user TEXT,
  edit_reason TEXT,
  posted_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS missed_story_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_or_headline TEXT NOT NULL,
  why_it_mattered TEXT,
  asset_topic TEXT,
  how_found TEXT,
  note TEXT,
  backtrace_category TEXT,
  backtrace_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS job_leases (
  job_name TEXT PRIMARY KEY,
  leased_until TEXT NOT NULL,
  holder TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posted_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES normalized_candidates(id),
  x_url TEXT NOT NULL UNIQUE,
  posted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS source_poll_state (
  source_id TEXT PRIMARY KEY,
  last_polled_at TEXT,
  last_item_at TEXT,
  etag TEXT,
  last_modified TEXT,
  backoff_until TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);
