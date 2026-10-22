const { createClient } = require("@libsql/client");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

app.use(express.json());

app.get("/api/scores", async (req, res) => {
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    const r = await db.execute(
      "SELECT player, score, created_at FROM scores ORDER BY score DESC LIMIT 10"
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/scores", async (req, res) => {
  const { player, score } = req.body || {};
  if (typeof player !== "string" || !player.trim() || !Number.isInteger(score)) {
    return res.status(400).json({ error: "Invalid data" });
  }
  try {
    await db.execute({
      sql: "INSERT INTO scores (player, score) VALUES (?, ?)",
      args: [player.trim().slice(0, 50), score],
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});
