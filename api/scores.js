const { createClient } = require("@libsql/client");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let ready;
function init() {
  if (!ready) {
    ready = db.execute(`
      CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player TEXT NOT NULL,
        score INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
  }
  return ready;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await init();

    if (req.method === "POST") {
      const { player, score } = req.body || {};
      if (typeof player !== "string" || !player.trim() || !Number.isInteger(score)) {
        return res.status(400).json({ error: "Invalid data" });
      }
      await db.execute({
        sql: "INSERT INTO scores (player, score) VALUES (?, ?)",
        args: [player.trim().slice(0, 50), score],
      });
      return res.status(201).json({ ok: true });
    }

    if (req.method === "GET") {
      const result = await db.execute(
        "SELECT player, score, created_at FROM scores ORDER BY score DESC LIMIT 10"
      );
      return res.status(200).json(result.rows);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
};
