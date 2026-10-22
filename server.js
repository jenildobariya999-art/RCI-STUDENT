const express = require("express");
const { createClient } = require("@libsql/client");

const app = express();
app.use(express.json({ limit: "1mb" }));

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

let db;
function getDb() {
  if (!url) throw new Error("Missing TURSO_DATABASE_URL environment variable");
  if (!db) {
    db = createClient({
      url,
      authToken: authToken || undefined
    });
  }
  return db;
}

let initPromise;
async function initDb() {
  if (!initPromise) {
    initPromise = getDb().execute(`
      CREATE TABLE IF NOT EXISTS app_data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  return initPromise;
}

app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Vercel + Turso API is running",
    endpoints: ["/health", "/api/data/:key"]
  });
});

app.get("/health", async (req, res) => {
  try {
    await initDb();
    await getDb().execute("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/data/:key", async (req, res) => {
  try {
    await initDb();
    const result = await getDb().execute({
      sql: "SELECT key, value, updated_at FROM app_data WHERE key = ?",
      args: [req.params.key]
    });
    if (!result.rows.length) return res.status(404).json({ ok: false, error: "Key not found" });
    const row = result.rows[0];
    let value = row.value;
    try { value = JSON.parse(value); } catch (_) {}
    res.json({ ok: true, key: row.key, value, updated_at: row.updated_at });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put("/api/data/:key", async (req, res) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, "value")) {
      return res.status(400).json({ ok: false, error: 'Send JSON with a "value" field' });
    }
    await initDb();
    const value = JSON.stringify(req.body.value);
    await getDb().execute({
      sql: `INSERT INTO app_data (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = CURRENT_TIMESTAMP`,
      args: [req.params.key, value]
    });
    res.json({ ok: true, key: req.params.key });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/data/:key", async (req, res) => {
  try {
    await initDb();
    const result = await getDb().execute({
      sql: "DELETE FROM app_data WHERE key = ?",
      args: [req.params.key]
    });
    res.json({ ok: true, deleted: Number(result.rowsAffected || 0) > 0 });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = app;
