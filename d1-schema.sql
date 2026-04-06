CREATE TABLE IF NOT EXISTS tracked_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_hash TEXT NOT NULL UNIQUE,
  draft_id INTEGER,
  contact_id INTEGER NOT NULL,
  organization_id INTEGER,
  original_url TEXT NOT NULL,
  link_label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS link_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER,
  contact_id INTEGER NOT NULL,
  organization_id INTEGER,
  link_hash TEXT NOT NULL,
  original_url TEXT NOT NULL,
  link_label TEXT,
  clicked_at TEXT DEFAULT (datetime('now')),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_tracked_hash ON tracked_links(link_hash);
CREATE INDEX IF NOT EXISTS idx_clicks_hash ON link_clicks(link_hash);
CREATE INDEX IF NOT EXISTS idx_clicks_contact ON link_clicks(contact_id);
CREATE INDEX IF NOT EXISTS idx_clicks_date ON link_clicks(clicked_at);
