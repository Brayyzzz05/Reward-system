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
// ENV CHECK
// =====================
if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error("❌ Missing TOKEN or CLIENT_ID");
  process.exit(1);
}

// =====================
// CLIENT
// =====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =====================
// RCON SAFE CONNECT
// =====================
let rcon = null;

async function connectRcon() {
  try {
    rcon = await Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });
    console.log("✅ RCON Connected");
  } catch {
    console.log("⚠️ RCON offline (ok)");
    rcon = null;
  }
}

connectRcon();
setInterval(connectRcon, 10000);

// =====================
// SAFE SEND
// =====================
async function safeSend(cmd) {
  if (!rcon) return false;
  try {
    await rcon.send(cmd);
    return true;
  } catch {
    return false;
  }
}

// =====================
// REWARD SYSTEM
// =====================
function getReward(pool) {
  const total = pool.reduce((a, b) => a + b.chance, 0);
  let r = Math.random() * total;

  for (const item of pool) {
    if (r < item.chance) return item.cmd;
    r -= item.chance;
  }
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link your Minecraft username")
    .addStringOption(opt =>
      opt.setName("username")
        .setDescription("Your Minecraft username")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll for a reward"),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim daily spins"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your stats"),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top players"),

  new SlashCommandBuilder()
    .setName("givespins")
    .setDescription("Admin: give spins")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("Target user")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("Amount")
        .setRequired(true)
    )
].map(c => c.toJSON());

// =====================
// REGISTER GLOBAL COMMANDS
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("🌍 Commands registered");
  } catch (err) {
    console.error("❌ Register error:", err);
  }
});

// =====================
// COMMAND HANDLER
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const id = i.user.id;

  let user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
    .get(id);

  if (!user) {
    db.prepare(`
      INSERT INTO users (discord_id, spins, streak, last_daily)
      VALUES (?, 0, 0, 0)
    `).run(id);

    user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(id);
  }

  // =====================
  // VERIFY (DISCORD ONLY)
  // =====================
  if (i.commandName === "verify") {
    const username = i.options.getString("username");

    db.prepare(`
      UPDATE users SET mc_username = ? WHERE discord_id = ?
    `).run(username, id);

    return i.reply(`✅ Linked to Minecraft username: ${username}`);
  }

  // =====================
  // ROLL
  // =====================
  if (i.commandName === "roll") {

    if (!user.mc_username)
      return i.reply("❌ Use /verify first");

    if ((user.spins || 0) <= 0)
      return i.reply("❌ No spins");

    db.prepare("UPDATE users SET spins = spins - 1 WHERE discord_id = ?")
      .run(id);

    const roll = Math.random();

    if (roll < 0.000000001) {
      await safeSend(`give ${user.mc_username} netherite_block 1`);
      return i.reply("💥 JACKPOT!!!");
    }

    if (roll < 0.00001) {
      await safeSend(`give ${user.mc_username} elytra 1`);
      return i.reply("🪽 YOU WON AN ELYTRA!");
    }

    const cmd = getReward(config.reward.pool)
      .replace("{player}", user.mc_username);

    await safeSend(cmd);

    return i.reply(`🎰 You received: \`${cmd}\``);
  }

  // =====================
  // DAILY
  // =====================
  if (i.commandName === "daily") {

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
    `).run(reward, streak, now, id);

    return i.reply(`🎁 +${reward} spins | 🔥 ${streak}`);
  }

  // =====================
  // STATS
  // =====================
  if (i.commandName === "stats") {
    return i.reply(`🎰 Spins: ${user.spins}\n🔥 Streak: ${user.streak}`);
  }

  // =====================
  // LEADERBOARD
  // =====================
  if (i.commandName === "leaderboard") {
    const rows = db.prepare(`
      SELECT mc_username, spins FROM users ORDER BY spins DESC LIMIT 10
    `).all();

    return i.reply(
      rows.map((r, i) => `#${i + 1} ${r.mc_username} - ${r.spins}`).join("\n")
    );
  }

  // =====================
  // ADMIN
  // =====================
  if (i.commandName === "givespins") {

    if (!i.member.permissions.has("Administrator"))
      return i.reply("❌ No permission");

    const u = i.options.getUser("user");
    const a = i.options.getInteger("amount");

    db.prepare("UPDATE users SET spins = spins + ? WHERE discord_id = ?")
      .run(a, u.id);

    return i.reply(`🎰 Gave ${a} spins`);
  }
});

client.login(process.env.TOKEN);