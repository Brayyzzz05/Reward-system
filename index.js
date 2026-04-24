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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================
// SAFE USER GET/CREATE
// =====================
function getUser(id) {
  db.prepare(`
    INSERT INTO users (discord_id)
    VALUES (?)
    ON CONFLICT(discord_id) DO NOTHING
  `).run(id);

  return db.prepare(
    "SELECT * FROM users WHERE discord_id=?"
  ).get(id);
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link MC account")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("Minecraft username")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Spin rewards"),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim daily spins"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View stats"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Open shop"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item to buy")
        .setRequired(true)
        .addChoices(
          { name: "Spin (1) - 20 msgs", value: "spin1" },
          { name: "Spin (5) - 80 msgs", value: "spin5" },
          { name: "Luck +0.5 - 100 msgs", value: "luck1" },
          { name: "Luck +1 - 250 msgs", value: "luck2" }
        )
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Amount")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("odds")
    .setDescription("View drop chances"),

  // =====================
  // ADMIN SET COMMANDS
  // =====================

  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Set user spins (admin only)")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target user")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Spin amount")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Set user messages (admin only)")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target user")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Message amount")
        .setRequired(true)
    )
].map(c => c.toJSON());

// =====================
// READY
// =====================
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("🤖 BOT READY (SET COMMANDS FIXED)");
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const id = i.user.id;
  const user = getUser(id);

  // =====================
  // VERIFY
  // =====================
  if (i.commandName === "verify") {
    const name = i.options.getString("username");

    db.prepare(
      "UPDATE users SET mc_username=? WHERE discord_id=?"
    ).run(name, id);

    return i.reply("✅ linked");
  }

  // =====================
  // DAILY (24H)
  // =====================
  if (i.commandName === "daily") {
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (user.last_daily && now - user.last_daily < cooldown) {
      const left = cooldown - (now - user.last_daily);
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);

      return i.reply(`⏳ Come back in ${h}h ${m}m`);
    }

    db.prepare(`
      UPDATE users
      SET spins = spins + 2,
          last_daily = ?
      WHERE discord_id = ?
    `).run(now, id);

    return i.reply("🎁 +2 spins");
  }

  // =====================
  // STATS
  // =====================
  if (i.commandName === "stats") {
    return i.reply(
`📊 Stats:
🎟️ Spins: ${user.spins}
💬 Messages: ${user.messages}
🍀 Luck: x${user.luck_multi}`
    );
  }

  // =====================
  // SHOP
  // =====================
  if (i.commandName === "shop") {
    return i.reply("🛒 Use /buy spin1, spin5, luck1, luck2");
  }

  // =====================
  // BUY
  // =====================
  if (i.commandName === "buy") {
    const item = i.options.getString("item");
    const amount = i.options.getInteger("amount") || 1;

    let cost = 0, spins = 0, luck = 0;

    if (item === "spin1") { cost = 20; spins = 1; }
    if (item === "spin5") { cost = 80; spins = 5; }
    if (item === "luck1") { cost = 100; luck = 0.5; }
    if (item === "luck2") { cost = 250; luck = 1; }

    const total = cost * amount;

    if (user.messages < total) {
      return i.reply("❌ Not enough messages");
    }

    db.prepare(`
      UPDATE users
      SET messages = messages - ?,
          spins = spins + ?,
          luck_multi = luck_multi + ?
      WHERE discord_id = ?
    `).run(total, spins * amount, luck * amount, id);

    return i.reply(`✅ Bought x${amount}`);
  }

  // =====================
  // SET SPINS (ADMIN)
  // =====================
  if (i.commandName === "setspins") {
    if (!i.member.permissions.has("Administrator"))
      return i.reply({ content: "❌ Admin only", ephemeral: true });

    const target = i.options.getUser("user");
    const amount = i.options.getInteger("amount");

    getUser(target.id);

    db.prepare(
      "UPDATE users SET spins=? WHERE discord_id=?"
    ).run(amount, target.id);

    return i.reply(`✅ Set spins to ${amount}`);
  }

  // =====================
  // SET MESSAGES (ADMIN)
  // =====================
  if (i.commandName === "setmessages") {
    if (!i.member.permissions.has("Administrator"))
      return i.reply({ content: "❌ Admin only", ephemeral: true });

    const target = i.options.getUser("user");
    const amount = i.options.getInteger("amount");

    getUser(target.id);

    db.prepare(
      "UPDATE users SET messages=? WHERE discord_id=?"
    ).run(amount, target.id);

    return i.reply(`✅ Set messages to ${amount}`);
  }
});

// =====================
// LOGIN
// =====================
client.login(process.env.TOKEN);