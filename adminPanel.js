import express from "express";
import cors from "cors";
import db from "./database.js";

const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_KEY = process.env.ADMIN_KEY;

// auth middleware
function auth(req, res, next) {
  if (req.headers.authorization !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// =====================
// VIEW USERS
// =====================
app.get("/users", auth, async (req, res) => {
  const data = await db.query("SELECT * FROM users");
  res.json(data.rows);
});

// =====================
// SET SPINS
// =====================
app.post("/set-spins", auth, async (req, res) => {
  const { discord_id, spins } = req.body;

  await db.query(
    "UPDATE users SET spins=$1 WHERE discord_id=$2",
    [spins, discord_id]
  );

  res.json({ ok: true });
});

// =====================
// SET LUCK
// =====================
app.post("/set-luck", auth, async (req, res) => {
  const { discord_id, luck } = req.body;

  await db.query(
    "UPDATE users SET luck_multi=$1 WHERE discord_id=$2",
    [luck, discord_id]
  );

  res.json({ ok: true });
});

// =====================
// SET MESSAGES (optional admin edit)
// =====================
app.post("/set-messages", auth, async (req, res) => {
  const { discord_id, messages } = req.body;

  await db.query(
    "UPDATE users SET messages=$1 WHERE discord_id=$2",
    [messages, discord_id]
  );

  res.json({ ok: true });
});

// =====================
app.listen(3000, () => {
  console.log("🌐 Admin panel running on port 3000");
});