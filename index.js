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
// SELF-HEAL DB WRAPPER
// =====================
async function db(q, p = []) {
  for (let i = 0; i < 3; i++) {
    try {
      return await pool.query(q, p);
    } catch (e) {
      console.warn(`DB retry ${i + 1}`, e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("DB failed permanently");
}

// =====================
// GET USER (AUTO CREATE)
// =====================
async function getUser(id) {
  await db(
    `INSERT INTO users (discord_id)
     VALUES ($1)
     ON CONFLICT (discord_id) DO NOTHING`,
    [id]
  );

  const res = await db(
    "SELECT * FROM users WHERE discord_id=$1",
    [id]
  );

  return res.rows[0];
}

// =====================
// MESSAGE TRACKER
// =====================
client.on("messageCreate", async (m) => {
  try {
    if (!m.guild || m.author.bot) return;

    await db(
      `
      INSERT INTO users (discord_id, messages)
      VALUES ($1, 1)
      ON CONFLICT (discord_id)
      DO UPDATE SET messages = users.messages + 1
      `,
      [m.author.id]
    );

  } catch (e) {
    console.error("msg tracker error:", e.message);
  }
});

// =====================
// COMMANDS
// =====================
const commands = [

  new SlashCommandBuilder().setName("stats").setDescription("View stats"),
  new SlashCommandBuilder().setName("roll").setDescription("Spin rewards"),
  new SlashCommandBuilder().setName("daily").setDescription("Daily reward"),
  new SlashCommandBuilder().setName("odds").setDescription("View chances"),
  new SlashCommandBuilder().setName("shop").setDescription("Open shop"),

  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Admin set spins")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Admin set messages")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setluck")
    .setDescription("Admin set luck")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addNumberOption(o => o.setName("amount").setRequired(true))

].map(c => c.toJSON());

// =====================
// READY (SELF HEAL REGISTER)
// =====================
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  const register = async () => {
    try {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        { body: commands }
      );

      console.log("✅ Commands registered");
    } catch (e) {
      console.error("Retry register in 5s");
      setTimeout(register, 5000);
    }
  };

  await register();
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// SAFE REPLY
// =====================
const reply = async (i, msg) => {
  if (!i.replied) return i.reply(msg).catch(()=>{});
};

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {
  try {

    // =====================
    // BUTTON SHOP
    // =====================
    if (i.isButton()) {
      const u = await getUser(i.user.id);

      if (i.customId === "buy_spin") {
        if (u.messages < 20) return i.reply({ content: "❌ no msgs", ephemeral: true });

        await db(
          `UPDATE users SET messages = messages - 20, spins = spins + 1 WHERE discord_id=$1`,
          [i.user.id]
        );

        return i.reply({ content: "🎟 bought spin", ephemeral: true });
      }

      if (i.customId === "buy_luck") {
        if (u.messages < 100) return i.reply({ content: "❌ no msgs", ephemeral: true });

        await db(
          `UPDATE users SET messages = messages - 100, luck_multi = luck_multi + 0.5 WHERE discord_id=$1`,
          [i.user.id]
        );

        return i.reply({ content: "🍀 luck upgraded", ephemeral: true });
      }
    }

    if (!i.isChatInputCommand()) return;

    const id = i.user.id;
    const u = await getUser(id);

    // =====================
    // STATS
    // =====================
    if (i.commandName === "stats") {
      return reply(i,
`📊 Stats
🎟 Spins: ${u.spins}
💬 Messages: ${u.messages}
🍀 Luck: x${u.luck_multi}`
      );
    }

    // =====================
    // DAILY
    // =====================
    if (i.commandName === "daily") {
      const now = Date.now();
      const cd = 86400000;

      if (u.last_daily && now - u.last_daily < cd) {
        return reply(i, "⏳ cooldown");
      }

      await db(
        `UPDATE users SET spins = spins + 2, last_daily=$1 WHERE discord_id=$2`,
        [now, id]
      );

      return reply(i, "🎁 +2 spins");
    }

    // =====================
    // ROLL (ANIMATED)
    // =====================
    if (i.commandName === "roll") {
      if (u.spins <= 0) return reply(i, "❌ no spins");

      await db("UPDATE users SET spins = spins - 1 WHERE discord_id=$1", [id]);

      const pool = config.reward.pool.map(p => ({
        ...p,
        chance: p.chance * (u.luck_multi || 1)
      }));

      let total = pool.reduce((a,b)=>a+b.chance,0);
      let r = Math.random() * total;

      let result;

      for (const p of pool) {
        if (r < p.chance) {
          result = p;
          break;
        }
        r -= p.chance;
      }

      const frames = ["🎰","🎲","🎯","✨","💥","🎉"];

      await i.reply("🎰 spinning...");

      for (const f of frames) {
        await new Promise(r => setTimeout(r, 400));
        await i.editReply(`${f} spinning...`);
      }

      return i.editReply(
        `🎉 ${result.cmd.replace("{player}", u.mc_username || "player")}`
      );
    }

    // =====================
    // ODDS
    // =====================
    if (i.commandName === "odds") {
      const pool = config.reward.pool;
      const total = pool.reduce((a,b)=>a+b.chance,0);

      let msg = "📊 Odds:\n\n";

      for (const p of pool) {
        msg += `${p.cmd} → ${((p.chance/total)*100).toFixed(5)}%\n`;
      }

      return reply(i, msg);
    }

    // =====================
    // SHOP (INTERACTIVE)
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

      return reply(i, {
        content: "🛒 Shop",
        components: [row]
      });
    }

    // =====================
    // ADMIN CHECK
    // =====================
    const ADMIN = process.env.ADMIN_ID;
    const isAdmin = id === ADMIN;

    if (i.commandName === "setspins") {
      if (!isAdmin) return reply(i, "❌ no perm");

      await db("UPDATE users SET spins=$1 WHERE discord_id=$2",
        [i.options.getInteger("amount"), i.options.getUser("user").id]);

      return reply(i, "✅ done");
    }

    if (i.commandName === "setmessages") {
      if (!isAdmin) return reply(i, "❌ no perm");

      await db("UPDATE users SET messages=$1 WHERE discord_id=$2",
        [i.options.getInteger("amount"), i.options.getUser("user").id]);

      return reply(i, "✅ done");
    }

    if (i.commandName === "setluck") {
      if (!isAdmin) return reply(i, "❌ no perm");

      await db("UPDATE users SET luck_multi=$1 WHERE discord_id=$2",
        [i.options.getNumber("amount"), i.options.getUser("user").id]);

      return reply(i, "✅ done");
    }

  } catch (e) {
    console.error("interaction error:", e);
  }
});

// =====================
// GLOBAL SAFETY
// =====================
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// =====================
client.login(process.env.TOKEN);