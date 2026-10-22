-- Run this in the Turso SQL editor if you want to create the table manually.
-- The provided server.js also creates this table automatically.
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
