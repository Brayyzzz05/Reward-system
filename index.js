import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import db from "./database.js";
import config from "./config.js";
import { Rcon } from "rcon-client";

// =====================
// 🤖 CLIENT
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================
// 📦 STATE
// =====================
const pendingLinks = new Map();
const messageCooldown = new Map();
let rcon = null;
let serverOnline = false;

// =====================
// 🔌 SAFE RCON CONNECT (NO CRASH)
// =====================
async function connectRcon() {
  try {
    rcon = await Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    serverOnline = true;
    console.log("✅ RCON Connected");
  } catch (err) {
    rcon = null;
    serverOnline = false;
    console.log("⚠️ RCON offline — bot still running");
  }
}

connectRcon();

// retry connection every 10s
setInterval(connectRcon, 10000);

// =====================
// 🛡️ SAFE SEND FUNCTION
// =====================
async function safeSend(cmd, userId = null) {
  try {
    if (!rcon) throw new Error("RCON offline");

    await rcon.send(cmd);
    return true;

  } catch {

    // 💾 queue system
    if (userId) {
      const user = db.prepare("SELECT reward_queue FROM users WHERE discord_id = ?")
        .get(userId);

      const queue = user?.reward_queue ? JSON.parse(user.reward_queue) : [];
      queue.push(cmd);

      db.prepare(`
        UPDATE users SET reward_queue = ? WHERE discord_id = ?
      `).run(JSON.stringify(queue), userId);
    }

    return false;
  }
}

// =====================
// 🌙 WEEKEND CHECK
// =====================
function isWeekend() {
  const now = new Date();
  const sg = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return sg.getDay() === 0 || sg.getDay() === 6;
}

// =====================
// ⚡ LUCK
// =====================
function getLuck() {
  return isWeekend() ? 2 : 1;
}

// =====================
// 🎲 LOOT
// =====================
function getReward(pool, mult = 1) {
  const total = pool.reduce((a, b) => a + b.chance * mult, 0);
  let r = Math.random() * total;

  for (const i of pool) {
    const w = i.chance * mult;
    if (r < w) return i.cmd;
    r -= w;
  }
}

// =====================
// 🔧 SLASH COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName("verify")
    .addStringOption(o => o.setName("username").setRequired(true)),

  new SlashCommandBuilder().setName("roll"),
  new SlashCommandBuilder().setName("daily"),
  new SlashCommandBuilder().setName("stats"),
  new SlashCommandBuilder().setName("leaderboard"),

  new SlashCommandBuilder().setName("givespins")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

await rest.put(
  Routes.applicationCommands(process.env.CLIENT_ID),
  { body: commands }
);

// =====================
// 🤖 READY
// =====================
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// 💬 MESSAGE TRACKING (ANTI SPAM)
// =====================
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;

  const id = msg.author.id;
  const now = Date.now();

  const last = messageCooldown.get(id) || 0;
  if (now - last < 15000) return;

  messageCooldown.set(id, now);

  db.prepare(`
    INSERT INTO users (discord_id, messages, spins)
    VALUES (?, 1, 0)
    ON CONFLICT(discord_id)
    DO UPDATE SET messages = messages + 1
  `).run(id);
});

// =====================
// 🎮 INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {

  // =====================
  // 🎰 ROLL
  // =====================
  if (i.commandName === "roll") {

    const user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(i.user.id);

    if (!user?.mc_username)
      return i.reply("❌ Not linked");

    if ((user.spins || 0) <= 0)
      return i.reply("❌ No spins");

    db.prepare("UPDATE users SET spins = spins - 1 WHERE discord_id = ?")
      .run(i.user.id);

    const mult = getLuck();

    const cmd = getReward(config.reward.pool, mult)
      ?.replace("{player}", user.mc_username);

    await safeSend(cmd, i.user.id);

    return i.reply(`🎰 Rolled reward`);
  }

  // =====================
  // 🎁 DAILY
  // =====================
  if (i.commandName === "daily") {

    let user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(i.user.id);

    if (!user) {
      db.prepare(`
        INSERT INTO users (discord_id, spins, streak, last_daily)
        VALUES (?, 0, 0, 0)
      `).run(i.user.id);

      user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
        .get(i.user.id);
    }

    const now = Date.now();
    const day = 86400000;

    if (now - (user.last_daily || 0) < day)
      return i.reply("❌ Already claimed");

    let streak = user.streak || 0;
    if (now - (user.last_daily || 0) > day * 2) streak = 0;

    streak++;

    const reward = config.daily.baseSpins + streak * config.daily.streakBonus;

    db.prepare(`
      UPDATE users
      SET spins = spins + ?, streak = ?, last_daily = ?
      WHERE discord_id = ?
    `).run(reward, streak, now, i.user.id);

    return i.reply(`🎁 +${reward} spins | 🔥 ${streak}`);
  }

  // =====================
  // 📊 STATS
  // =====================
  if (i.commandName === "stats") {
    const u = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(i.user.id);

    return i.reply(`🎰 Spins: ${u?.spins || 0}\n🔥 Streak: ${u?.streak || 0}`);
  }

  // =====================
  // 🏆 LEADERBOARD
  // =====================
  if (i.commandName === "leaderboard") {
    const rows = db.prepare(`
      SELECT mc_username, spins FROM users ORDER BY spins DESC LIMIT 10
    `).all();

    return i.reply(
      rows.map((r, x) => `#${x + 1} ${r.mc_username} - ${r.spins}`).join("\n")
    );
  }

  // =====================
  // 🛠️ GIVESPINS
  // =====================
  if (i.commandName === "givespins") {

    if (!i.member.permissions.has("Administrator"))
      return i.reply("❌ No permission");

    const u = i.options.getUser("user");
    const a = i.options.getInteger("amount");

    db.prepare("UPDATE users SET spins = spins + ? WHERE discord_id = ?")
      .run(a, u.id);

    return i.reply(`🎰 +${a} spins`);
  }
});

// =====================
client.login(process.env.TOKEN);