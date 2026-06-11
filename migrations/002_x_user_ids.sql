-- Cache X username → user id resolutions for the official API fallback.
CREATE TABLE IF NOT EXISTS x_user_ids (
  handle TEXT PRIMARY KEY,          -- lowercase username
  user_id TEXT NOT NULL,
  resolved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
