import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import db from "./database.js";
import { Rcon } from "rcon-client";

// =====================
// 📦 STATE
// =====================
const pendingLinks = new Map();
const messageCooldown = new Map();

// =====================
// 🔌 RCON
// =====================
const rcon = await Rcon.connect({
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT),
  password: process.env.RCON_PASSWORD
});

console.log("✅ RCON Connected");

// =====================
// 🌙 WEEKEND BOOST
// =====================
function isWeekend() {
  const now = new Date();
  const sg = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const day = sg.getDay();
  return day === 0 || day === 6;
}

// =====================
// ⚡ LUCK SYSTEM
// =====================
function getLuckMultiplier(userId) {
  const base = 1;
  const weekend = isWeekend() ? 2 : 1;
  return base * weekend;
}

// =====================
// 🎲 SPECIAL DROPS
// =====================
function rollSpecial(player, multiplier) {
  let jackpot = 0.000000001 * multiplier;
  let elytra = 0.00001 * multiplier;

  const r = Math.random();

  if (r < jackpot) return { type: "jackpot" };
  if (r < elytra) return { type: "elytra", cmd: `give ${player} elytra 1` };

  return null;
}

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
// 🔧 REGISTER SLASH COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Link MC account")
    .addStringOption(o => o.setName("username").setRequired(true)),

  new SlashCommandBuilder().setName("roll").setDescription("Spin reward"),
  new SlashCommandBuilder().setName("stats").setDescription("View stats"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Top players"),
  new SlashCommandBuilder().setName("daily").setDescription("Claim daily spins"),

  new SlashCommandBuilder().setName("givespins").setDescription("Admin give spins")
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
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// 💬 MESSAGE SPAM FILTER (15s RULE)
// =====================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;
  const now = Date.now();

  const last = messageCooldown.get(id) || 0;
  if (now - last < 15000) return;

  messageCooldown.set(id, now);

  let user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
    .get(id);

  if (!user) {
    db.prepare("INSERT INTO users (discord_id, messages, spins) VALUES (?, 0, 0)")
      .run(id);

    user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(id);
  }

  db.prepare(`
    UPDATE users 
    SET messages = messages + 1 
    WHERE discord_id = ?
  `).run(id);
});

// =====================
// 🎮 SLASH COMMANDS
// =====================
client.on("interactionCreate", async (interaction) => {

  // =====================
  // 🔐 VERIFY
  // =====================
  if (interaction.commandName === "verify") {

    const username = interaction.options.getString("username");
    const code = Math.floor(10000 + Math.random() * 90000);

    pendingLinks.set(interaction.user.id, {
      mc_username: username,
      code,
      expires: Date.now() + 120000
    });

    return interaction.reply(
      `🔐 Run in Minecraft:\n/say VERIFY ${code}`
    );
  }

  // =====================
  // 🎰 ROLL
  // =====================
  if (interaction.commandName === "roll") {

    const user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(interaction.user.id);

    if (!user?.mc_username) {
      return interaction.reply("❌ Not linked");
    }

    if ((user.spins || 0) <= 0) {
      return interaction.reply("❌ No spins");
    }

    db.prepare("UPDATE users SET spins = spins - 1 WHERE discord_id = ?")
      .run(interaction.user.id);

    const multiplier = getLuckMultiplier(interaction.user.id);
    const special = rollSpecial(user.mc_username, multiplier);

    let msg = "COMMON";

    try {

      if (special?.type === "jackpot") {
        msg = "💥 JACKPOT";
        await rcon.send(`give ${user.mc_username} netherite_block 1`);
        await rcon.send(`give ${user.mc_username} beacon 1`);
      }

      else if (special?.type === "elytra") {
        msg = "🪽 ELYTRA";
        await rcon.send(special.cmd);
      }

      else {
        msg = "🎁 NORMAL";
        await rcon.send(`give ${user.mc_username} diamond 1`);
      }

      db.prepare(`
        UPDATE users SET spins = spins + 1 WHERE discord_id = ?
      `).run(interaction.user.id);

    } catch (e) {
      console.error(e);
    }

    return interaction.reply(`🎰 Result: ${msg}`);
  }

  // =====================
  // 📊 STATS
  // =====================
  if (interaction.commandName === "stats") {

    const user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(interaction.user.id);

    return interaction.reply(
      `📊 Stats\n\n🎰 Spins: ${user?.spins || 0}\n💬 Messages: ${user?.messages || 0}\n🎮 MC: ${user?.mc_username || "Not linked"}`
    );
  }

  // =====================
  // 🏆 LEADERBOARD
  // =====================
  if (interaction.commandName === "leaderboard") {

    const rows = db.prepare(`
      SELECT mc_username, spins 
      FROM users 
      ORDER BY spins DESC 
      LIMIT 10
    `).all();

    const text = rows.map((u, i) =>
      `**${i + 1}.** ${u.mc_username || "Unknown"} — 🎰 ${u.spins}`
    ).join("\n");

    return interaction.reply(`🏆 Leaderboard\n\n${text}`);
  }

  // =====================
  // 🎁 DAILY
  // =====================
  if (interaction.commandName === "daily") {

    let user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(interaction.user.id);

    const now = Date.now();
    const last = user?.last_daily || 0;

    const day = 86400000;

    if (now - last < day) {
      return interaction.reply("❌ Already claimed daily");
    }

    const streak = (user?.streak || 0) + 1;
    const reward = 5 + streak * 2;

    db.prepare(`
      UPDATE users 
      SET spins = spins + ?, last_daily = ?, streak = ?
      WHERE discord_id = ?
    `).run(reward, now, streak, interaction.user.id);

    return interaction.reply(`🎁 +${reward} spins | 🔥 streak ${streak}`);
  }

  // =====================
  // 🛠️ ADMIN SPINS
  // =====================
  if (interaction.commandName === "givespins") {

    if (!interaction.member.permissions.has("Administrator")) {
      return interaction.reply("❌ No permission");
    }

    const user = interaction.options.getUser("user");
    const amt = interaction.options.getInteger("amount");

    db.prepare(`
      UPDATE users SET spins = spins + ? WHERE discord_id = ?
    `).run(amt, user.id);

    return interaction.reply(`🎰 Gave ${amt} spins`);
  }
});

// =====================
// 🔐 VERIFY LOOP
// =====================
setInterval(async () => {
  try {
    const log = await rcon.send("list");

    for (const [id, data] of pendingLinks.entries()) {

      if (Date.now() > data.expires) {
        pendingLinks.delete(id);
        continue;
      }

      if (log.includes(`VERIFY ${data.code}`)) {

        db.prepare(`
          INSERT INTO users (discord_id, mc_username)
          VALUES (?, ?)
          ON CONFLICT(discord_id)
          DO UPDATE SET mc_username = excluded.mc_username
        `).run(id, data.mc_username);

        const user = await client.users.fetch(id);
        user.send(`✅ Linked to ${data.mc_username}`);

        pendingLinks.delete(id);
      }
    }
  } catch (e) {}
}, 5000);

// =====================
client.login(process.env.TOKEN);