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
// CLIENT (IMPORTANT INTENTS)
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================
// RCON SAFE
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
    console.log("⚠️ RCON offline");
    rcon = null;
  }
}
connectRcon();
setInterval(connectRcon, 10000);

async function safeSend(cmd) {
  try {
    if (!rcon) throw new Error();
    await rcon.send(cmd);
  } catch {}
}

// =====================
// SLOT SYMBOLS
// =====================
const symbols = ["🍒", "💎", "🪙", "🔥", "⭐", "🪽"];

// =====================
// REWARD PICKER
// =====================
function getReward(pool) {
  if (!pool || pool.length === 0) return null;

  const total = pool.reduce((a, b) => a + b.chance, 0);
  let r = Math.random() * total;

  for (const item of pool) {
    if (r < item.chance) return item.cmd;
    r -= item.chance;
  }

  return null;
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link Minecraft username")
    .addStringOption(opt =>
      opt.setName("username")
        .setDescription("Your Minecraft username")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Spin the slot machine"),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim daily spins"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View stats"),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top players"),

  new SlashCommandBuilder()
    .setName("givespins")
    .setDescription("Admin: give spins")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Target user").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Amount").setRequired(true)
    )
].map(c => c.toJSON());

// =====================
// REGISTER COMMANDS
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("🌍 Commands registered");
});

// =====================
// SLASH COMMAND HANDLER
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  try {
    await i.deferReply();

    const id = i.user.id;
    const now = Date.now();

    let user = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(id);

    if (!user) {
      db.prepare(`
        INSERT INTO users (discord_id, spins, streak, last_daily, messages, last_message, last_roll)
        VALUES (?, 0, 0, 0, 0, 0, 0)
      `).run(id);

      user = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(id);
    }

    // VERIFY
    if (i.commandName === "verify") {
      const username = i.options.getString("username");
      db.prepare("UPDATE users SET mc_username = ? WHERE discord_id = ?")
        .run(username, id);

      return i.editReply(`✅ Linked to ${username}`);
    }

    // ROLL
    if (i.commandName === "roll") {

      const cd = config.cooldowns.roll * 1000;

      if (now - (user.last_roll || 0) < cd) {
        const left = Math.ceil((cd - (now - user.last_roll)) / 1000);
        return i.editReply(`⏱️ Wait ${left}s`);
      }

      if (!user.mc_username)
        return i.editReply("❌ Use /verify first");

      if ((user.spins || 0) <= 0)
        return i.editReply("❌ No spins");

      db.prepare("UPDATE users SET spins = spins - 1, last_roll = ? WHERE discord_id = ?")
        .run(now, id);

      let msg = await i.editReply("🎰 Spinning...\n⬜⬜⬜");

      for (let t = 0; t < 3; t++) {
        const spin =
          `${symbols[Math.floor(Math.random()*symbols.length)]} ` +
          `${symbols[Math.floor(Math.random()*symbols.length)]} ` +
          `${symbols[Math.floor(Math.random()*symbols.length)]}`;

        await new Promise(r => setTimeout(r, 400));
        await msg.edit(`🎰 Spinning...\n${spin}`);
      }

      const rewardRaw = getReward(config.reward.pool);
      if (!rewardRaw) return msg.edit("❌ Reward error");

      const cmd = rewardRaw.replace("{player}", user.mc_username);

      await safeSend(cmd);

      return msg.edit(`🎰 You got:\n\`${cmd}\``);
    }

    // DAILY
    if (i.commandName === "daily") {

      const day = 86400000;

      if (now - (user.last_daily || 0) < day)
        return i.editReply("❌ Already claimed");

      let streak = user.streak || 0;
      if (now - (user.last_daily || 0) > day * 2) streak = 0;

      streak++;

      const reward = config.daily.baseSpins + streak * config.daily.streakBonus;

      db.prepare(`
        UPDATE users
        SET spins = spins + ?, streak = ?, last_daily = ?
        WHERE discord_id = ?
      `).run(reward, streak, now, id);

      return i.editReply(`🎁 +${reward} spins | 🔥 ${streak}`);
    }

    // STATS
    if (i.commandName === "stats") {
      return i.editReply(
        `🎰 Spins: ${user.spins || 0}\n💬 Progress: ${user.messages || 0}/${config.reward.messagesRequired}`
      );
    }

    // LEADERBOARD
    if (i.commandName === "leaderboard") {
      const rows = db.prepare(`
        SELECT mc_username, spins FROM users ORDER BY spins DESC LIMIT 10
      `).all();

      return i.editReply(
        rows.map((r, i) => `#${i + 1} ${r.mc_username || "Unknown"} - ${r.spins}`).join("\n")
      );
    }

    // ADMIN
    if (i.commandName === "givespins") {
      if (!i.member.permissions.has("Administrator"))
        return i.editReply("❌ No permission");

      const u = i.options.getUser("user");
      const a = i.options.getInteger("amount");

      db.prepare("UPDATE users SET spins = spins + ? WHERE discord_id = ?")
        .run(a, u.id);

      return i.editReply(`🎰 Gave ${a} spins`);
    }

  } catch (err) {
    console.error("❌ ERROR:", err);

    if (i.deferred || i.replied) {
      i.editReply(`❌ ${err.message}`);
    } else {
      i.reply(`❌ ${err.message}`);
    }
  }
});

// =====================
// MESSAGE ANTI-SPAM SYSTEM
// =====================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const id = msg.author.id;
  const now = Date.now();

  let user = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(id);

  if (!user) {
    db.prepare(`
      INSERT INTO users (discord_id, spins, streak, last_daily, messages, last_message)
      VALUES (?, 0, 0, 0, 0, 0)
    `).run(id);

    user = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(id);
  }

  const cd = config.cooldowns.message * 1000;

  if (now - (user.last_message || 0) < cd) return;

  const newMessages = (user.messages || 0) + 1;

  db.prepare(`
    UPDATE users
    SET messages = ?, last_message = ?
    WHERE discord_id = ?
  `).run(newMessages, now, id);

  if (newMessages >= config.reward.messagesRequired) {
    db.prepare(`
      UPDATE users
      SET spins = spins + 1, messages = 0
      WHERE discord_id = ?
    `).run(id);

    msg.reply("🎟️ You earned a spin! Use /roll");
  }
});

// =====================
client.login(process.env.TOKEN);