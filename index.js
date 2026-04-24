import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import pool from "./database.js";
import config from "./config.js";

// =====================
// CLIENT
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================
// GUARANTEE SYSTEM
// =====================
const guaranteeMap = new Map();

// =====================
// DB WRAPPER
// =====================
async function db(q, p = []) {
  for (let i = 0; i < 3; i++) {
    try {
      return await pool.query(q, p);
    } catch (e) {
      console.warn("DB retry:", e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("DB failed");
}

// =====================
// USER INIT
// =====================
async function getUser(id) {
  await db(`
    INSERT INTO users (discord_id)
    VALUES ($1)
    ON CONFLICT (discord_id) DO NOTHING
  `, [id]);

  const r = await db(
    "SELECT * FROM users WHERE discord_id=$1",
    [id]
  );

  return r.rows[0];
}

// =====================
// MESSAGE CURRENCY TRACKER
// =====================
client.on("messageCreate", async (m) => {
  if (!m.guild || m.author.bot) return;

  await db(`
    INSERT INTO users (discord_id, messages)
    VALUES ($1, 1)
    ON CONFLICT (discord_id)
    DO UPDATE SET messages = users.messages + 1
  `, [m.author.id]);
});

// =====================
// COMMANDS
// =====================
const commands = [

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your stats"),

  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Spin rewards"),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim daily rewards"),

  new SlashCommandBuilder()
    .setName("odds")
    .setDescription("View drop chances"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Open shop"),

  // ADMIN
  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Admin: set spins")
    .addUserOption(o =>
      o.setName("user").setDescription("user").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setDescription("spins").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Admin: set messages")
    .addUserOption(o =>
      o.setName("user").setDescription("user").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setDescription("messages").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setluck")
    .setDescription("Admin: set luck multiplier")
    .addUserOption(o =>
      o.setName("user").setDescription("user").setRequired(true))
    .addNumberOption(o =>
      o.setName("amount").setDescription("luck").setRequired(true)),

  // =====================
  // GUARANTEE SYSTEM
  // =====================
  new SlashCommandBuilder()
    .setName("setguarantee")
    .setDescription("Admin: set guaranteed rarity for a user")
    .addUserOption(o =>
      o.setName("user").setDescription("target user").setRequired(true))
    .addStringOption(o =>
      o.setName("rarity")
        .setDescription("common / rare / epic / legendary / jackpot")
        .setRequired(true))
    .addBooleanOption(o =>
      o.setName("state")
        .setDescription("enable or disable")
        .setRequired(true))

].map(c => c.toJSON());

// =====================
// REGISTER
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

  console.log("✅ Commands ready");
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// SAFE REPLY
// =====================
const reply = (i, msg) => {
  if (!i.replied) return i.reply(msg).catch(()=>{});
};

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {
  try {

    if (!i.isChatInputCommand()) return;

    const id = i.user.id;
    const u = await getUser(id);

    // =====================
    // STATS
    // =====================
    if (i.commandName === "stats") {
      return reply(i,
`📊 Stats
💬 Messages: ${u.messages}
🎟 Spins: ${u.spins}
🍀 Luck: x${u.luck_multi}`
      );
    }

    // =====================
    // DAILY
    // =====================
    if (i.commandName === "daily") {
      const now = Date.now();
      if (u.last_daily && now - u.last_daily < 86400000)
        return reply(i, "⏳ cooldown");

      await db(`
        UPDATE users
        SET spins = spins + 2,
            last_daily = $1
        WHERE discord_id=$2
      `, [now, id]);

      return reply(i, "🎁 +2 spins");
    }

    // =====================
    // SHOP
    // =====================
    if (i.commandName === "shop") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("buy_spin")
          .setLabel("Buy Spin (20 msgs)")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("buy_luck")
          .setLabel("Buy Luck (100 msgs)")
          .setStyle(ButtonStyle.Success)
      );

      return reply(i, { content: "🛒 Shop", components: [row] });
    }

    // =====================
    // ODDS
    // =====================
    if (i.commandName === "odds") {
      const pool = config.reward.pool;
      const total = pool.reduce((a,b)=>a+b.chance,0);

      let msg = "📊 Odds:\n\n";

      for (const p of pool) {
        msg += `${p.cmd} → ${((p.chance/total)*100).toFixed(4)}%\n`;
      }

      return reply(i, msg);
    }

    // =====================
    // ROLL (WITH GUARANTEE SYSTEM)
    // =====================
    if (i.commandName === "roll") {

      if (u.spins <= 0)
        return reply(i, "❌ no spins");

      await db("UPDATE users SET spins = spins - 1 WHERE discord_id=$1", [id]);

      const g = guaranteeMap.get(id);

      let result;

      if (g?.active) {

        const pool = config.reward.pool;
        const match = pool.filter(p => p.rarity === g.rarity);

        result = match.length
          ? match[Math.floor(Math.random() * match.length)]
          : pool[0];

        guaranteeMap.delete(id);

      } else {

        const pool = config.reward.pool;
        let total = pool.reduce((a,b)=>a+b.chance,0);
        let r = Math.random() * total;

        for (const p of pool) {
          if (r < p.chance) {
            result = p;
            break;
          }
          r -= p.chance;
        }
      }

      const frames = ["🎰","🎲","🎯","✨","💥","🎉"];

      await i.reply("🎰 spinning...");

      for (const f of frames) {
        await new Promise(r => setTimeout(r, 400));
        await i.editReply(`${f} spinning...`);
      }

      return i.editReply(`🎉 ${result.cmd}`);
    }

    // =====================
    // ADMIN CHECK
    // =====================
    const ADMIN = process.env.ADMIN_ID;
    if (id !== ADMIN &&
        ["setspins","setmessages","setluck","setguarantee"].includes(i.commandName)) {
      return reply(i, "❌ no permission");
    }

    // =====================
    // ADMIN: SET GUARANTEE
    // =====================
    if (i.commandName === "setguarantee") {

      const target = i.options.getUser("user").id;
      const rarity = i.options.getString("rarity").toLowerCase();
      const state = i.options.getBoolean("state");

      if (!state) {
        guaranteeMap.delete(target);
        return i.reply({ content: "🧹 removed", ephemeral: true });
      }

      guaranteeMap.set(target, { rarity, active: true });

      return i.reply({
        content: `✅ ${rarity} guaranteed`,
        ephemeral: true
      });
    }

    // =====================
    // ADMIN SETTERS
    // =====================
    if (i.commandName === "setspins") {
      await db("UPDATE users SET spins=$1 WHERE discord_id=$2",
        [i.options.getInteger("amount"), i.options.getUser("user").id]);

      return reply(i, "✅ done");
    }

    if (i.commandName === "setmessages") {
      await db("UPDATE users SET messages=$1 WHERE discord_id=$2",
        [i.options.getInteger("amount"), i.options.getUser("user").id]);

      return reply(i, "✅ done");
    }

    if (i.commandName === "setluck") {
      await db("UPDATE users SET luck_multi=$1 WHERE discord_id=$2",
        [i.options.getNumber("amount"), i.options.getUser("user").id]);

      return reply(i, "✅ done");
    }

  } catch (e) {
    console.error("interaction error:", e);
  }
});

// =====================
client.login(process.env.TOKEN);