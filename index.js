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
import { deliverReward, startRewardWorker } from "./rewardSystem.js";

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
// DB HELPER
// =====================
async function db(q, p = []) {
  return pool.query(q, p);
}

// =====================
// USER FETCH / CREATE
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
// MESSAGE TRACKER (CURRENCY)
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
const commands = [];

const add = (cmd) => commands.push(cmd.toJSON());

// USER
add(new SlashCommandBuilder().setName("stats").setDescription("View stats"));
add(new SlashCommandBuilder().setName("roll").setDescription("Spin rewards"));
add(new SlashCommandBuilder().setName("daily").setDescription("Daily reward"));
add(new SlashCommandBuilder().setName("shop").setDescription("Shop"));
add(new SlashCommandBuilder().setName("odds").setDescription("View odds"));

// VERIFY (MC LINK)
add(
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link Minecraft account")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("Minecraft username")
        .setRequired(true)
    )
);

// BUY
add(
  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item").setDescription("spin or luck").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setDescription("amount").setRequired(true))
);

// ADMIN
add(
  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Admin set spins")
    .addUserOption(o =>
      o.setName("user").setDescription("user").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setDescription("amount").setRequired(true))
);

add(
  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Admin set messages")
    .addUserOption(o =>
      o.setName("user").setDescription("user").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setDescription("amount").setRequired(true))
);

add(
  new SlashCommandBuilder()
    .setName("setluck")
    .setDescription("Admin set luck")
    .addUserOption(o =>
      o.setName("user").setDescription("user").setRequired(true))
    .addNumberOption(o =>
      o.setName("amount").setDescription("amount").setRequired(true))
);

// =====================
// REGISTER COMMANDS
// =====================
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("✅ Commands registered");
}

// =====================
// READY
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  await registerCommands();

  // 🔁 START REWARD SYSTEM WORKER
  startRewardWorker();
});

// =====================
// HELPERS
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

    const u = await getUser(i.user.id);
    const isAdmin = i.memberPermissions?.has("Administrator");

    // =====================
    // VERIFY
    // =====================
    if (i.commandName === "verify") {
      const name = i.options.getString("username");

      await db(`
        UPDATE users
        SET minecraft_name=$1
        WHERE discord_id=$2
      `, [name, i.user.id]);

      return reply(i, `✅ Linked to Minecraft: **${name}**`);
    }

    // =====================
    // STATS
    // =====================
    if (i.commandName === "stats") {
      return reply(i,
`📊 Stats
💬 Messages: ${u.messages}
🎟 Spins: ${u.spins}
🍀 Luck: ${u.luck_multi}`
      );
    }

    // =====================
    // SHOP
    // =====================
    if (i.commandName === "shop") {
      return reply(i,
`🛒 SHOP

🎟 spin x1 = 20 msgs
🎟 spin x5 = 80 msgs

🍀 luck x1 = 100 msgs
🍀 luck x5 = 500 msgs

Use /buy`
      );
    }

    // =====================
    // BUY
    // =====================
    if (i.commandName === "buy") {
      const item = i.options.getString("item");
      const amount = i.options.getInteger("amount");

      if (item === "spin") {
        const cost = amount >= 5 ? 80 : 20 * amount;

        if (u.messages < cost)
          return reply(i, "❌ not enough messages");

        await db(`
          UPDATE users
          SET spins = spins + $1,
              messages = messages - $2
          WHERE discord_id=$3
        `, [amount, cost, i.user.id]);

        return reply(i, `🎟 bought ${amount} spins`);
      }

      if (item === "luck") {
        const cost = amount >= 5 ? 500 : 100 * amount;

        if (u.messages < cost)
          return reply(i, "❌ not enough messages");

        await db(`
          UPDATE users
          SET luck_multi = luck_multi + $1,
              messages = messages - $2
          WHERE discord_id=$3
        `, [amount, cost, i.user.id]);

        return reply(i, `🍀 bought ${amount} luck`);
      }

      return reply(i, "❌ invalid item");
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
      `, [now, i.user.id]);

      return reply(i, "🎁 +2 spins");
    }

    // =====================
    // ODDS
    // =====================
    if (i.commandName === "odds") {
      const pool = config.reward.pool;
      const total = pool.reduce((a,b)=>a+b.chance,0);

      let msg = "📊 Odds\n\n";

      for (const p of pool) {
        msg += `${p.cmd} → ${((p.chance/total)*100).toFixed(4)}%\n`;
      }

      return reply(i, msg);
    }

    // =====================
    // ROLL (REWARD DELIVERY)
    // =====================
    if (i.commandName === "roll") {

      if (!u.minecraft_name)
        return reply(i, "❌ Use /verify first");

      if (u.spins <= 0)
        return reply(i, "❌ no spins");

      await db("UPDATE users SET spins = spins - 1 WHERE discord_id=$1", [i.user.id]);

      const pool = config.reward.pool;
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

      await deliverReward(i.user.id, u.minecraft_name, result.cmd);

      return reply(i, "🎰 Reward processing...");
    }

    // =====================
    // ADMIN
    // =====================
    if (!isAdmin &&
      ["setspins","setmessages","setluck"].includes(i.commandName)) {
      return reply(i, "❌ admin only");
    }

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
    console.error(e);
  }
});

// =====================
client.login(process.env.TOKEN);