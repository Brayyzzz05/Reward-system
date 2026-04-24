import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import pool from "./database.js";
import config from "./config.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================
// GET / CREATE USER
// =====================
async function getUser(id) {
  await pool.query(
    `INSERT INTO users (discord_id)
     VALUES ($1)
     ON CONFLICT (discord_id) DO NOTHING`,
    [id]
  );

  const res = await pool.query(
    "SELECT * FROM users WHERE discord_id=$1",
    [id]
  );

  return res.rows[0];
}

// =====================
// MESSAGE TRACKER (ADDED HERE)
// =====================
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const id = message.author.id;

    await pool.query(
      `
      INSERT INTO users (discord_id, messages)
      VALUES ($1, 1)
      ON CONFLICT (discord_id)
      DO UPDATE SET messages = users.messages + 1
      `,
      [id]
    );

  } catch (err) {
    console.error("❌ Message tracker error:", err);
  }
});

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
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item")
        .setRequired(true)
        .addChoices(
          { name: "Spin (1)", value: "spin1" },
          { name: "Spin (5)", value: "spin5" },
          { name: "Luck +0.5", value: "luck1" },
          { name: "Luck +1", value: "luck2" }
        )
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Amount")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("odds")
    .setDescription("View chances")
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

  console.log("🤖 BOT READY (POSTGRES + MESSAGE TRACKING)");
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {
  try {
    if (!i.isChatInputCommand()) return;

    const id = i.user.id;
    const user = await getUser(id);

    // VERIFY
    if (i.commandName === "verify") {
      const name = i.options.getString("username");

      await pool.query(
        "UPDATE users SET mc_username=$1 WHERE discord_id=$2",
        [name, id]
      );

      return i.reply("✅ linked");
    }

    // DAILY
    if (i.commandName === "daily") {
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;

      if (user.last_daily && now - user.last_daily < cooldown) {
        return i.reply("⏳ cooldown active");
      }

      await pool.query(
        `UPDATE users
         SET spins = spins + 2,
             last_daily = $1
         WHERE discord_id = $2`,
        [now, id]
      );

      return i.reply("🎁 +2 spins");
    }

    // STATS
    if (i.commandName === "stats") {
      return i.reply(
`📊 Stats:
🎟 Spins: ${user.spins}
💬 Messages: ${user.messages}
🍀 Luck: x${user.luck_multi}`
      );
    }

    // BUY
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
        return i.reply("❌ not enough messages");
      }

      await pool.query(
        `UPDATE users
         SET messages = messages - $1,
             spins = spins + $2,
             luck_multi = luck_multi + $3
         WHERE discord_id = $4`,
        [total, spins * amount, luck * amount, id]
      );

      return i.reply("✅ purchase complete");
    }

    // ODDS
    if (i.commandName === "odds") {
      const poolData = config.reward.pool;
      const luck = user.luck_multi || 1;

      const total = poolData.reduce((a,b)=>a+b.chance,0);

      let msg = "📊 Odds:\n\n";

      for (const item of poolData) {
        const percent = ((item.chance * luck) / total * 100).toFixed(5);
        msg += `${item.cmd.replace("give {player} ","")} → ${percent}%\n`;
      }

      return i.reply(msg);
    }

    // ROLL
    if (i.commandName === "roll") {
      if (user.spins <= 0) return i.reply("❌ no spins");

      await pool.query(
        "UPDATE users SET spins = spins - 1 WHERE discord_id = $1",
        [id]
      );

      const luck = user.luck_multi || 1;

      const adjusted = config.reward.pool.map(p => ({
        ...p,
        chance: p.chance * luck
      }));

      let total = adjusted.reduce((a,b)=>a+b.chance,0);
      let r = Math.random() * total;

      let reward;
      for (const item of adjusted) {
        if (r < item.chance) {
          reward = item;
          break;
        }
        r -= item.chance;
      }

      const cmd = reward.cmd.replace("{player}", user.mc_username || "player");

      return i.reply(`🎉 ${cmd}`);
    }

  } catch (err) {
    console.error("INTERACTION ERROR:", err);
    if (!i.replied) return i.reply("⚠️ error occurred");
  }
});

client.login(process.env.TOKEN);