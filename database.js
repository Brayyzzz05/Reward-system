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
import crypto from "crypto";

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
// GLOBAL SAFETY (CRASH STOPPER)
// =====================
process.on("unhandledRejection", (err) => {
  console.error("⚠️ UnhandledRejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("⚠️ UncaughtException:", err);
});

// =====================
// DB WRAPPER SAFE
// =====================
const query = (q, p = []) => db.query(q, p);

// =====================
// SAFE REPLY (FIXES "NOT RESPONDING")
// =====================
async function safeReply(i, content) {
  try {
    if (i.deferred || i.replied) {
      return i.followUp({ content, ephemeral: true });
    }
    return i.reply({ content, ephemeral: true });
  } catch (e) {
    console.error("Reply error:", e);
  }
}

// =====================
// RCON SAFE WRAPPER
// =====================
async function runCommand(cmd) {
  try {
    if (!global.rconSend) throw new Error("RCON missing");
    return await global.rconSend(cmd);
  } catch (e) {
    throw e;
  }
}

// =====================
// USER FETCH SAFE
// =====================
async function getUser(id) {
  await query(`
    INSERT INTO users (discord_id)
    VALUES ($1)
    ON CONFLICT DO NOTHING
  `, [id]);

  const res = await query(
    "SELECT * FROM users WHERE discord_id=$1",
    [id]
  );

  return res.rows[0] || {
    messages: 0,
    spins: 0,
    luck_multi: 0
  };
}

// =====================
// MESSAGE TRACKER
// =====================
client.on("messageCreate", async (m) => {
  if (!m.guild || m.author.bot) return;

  try {
    await query(`
      INSERT INTO users (discord_id, messages)
      VALUES ($1, 1)
      ON CONFLICT (discord_id)
      DO UPDATE SET messages = users.messages + 1
    `, [m.author.id]);
  } catch (e) {
    console.error("Message track error:", e);
  }
});

// =====================
// HASH
// =====================
function hash(id, cmd) {
  return crypto
    .createHash("sha256")
    .update(id + cmd + Date.now())
    .digest("hex");
}

// =====================
// REWARD DELIVERY (QUEUE SAFE)
// =====================
async function deliverReward(discordId, mcName, cmd) {
  const finalCmd = cmd.replace("{player}", mcName);
  const h = hash(discordId, finalCmd);

  try {
    const exists = await query(
      "SELECT 1 FROM delivered_rewards WHERE reward_hash=$1",
      [h]
    );

    if (exists.rows.length > 0) return;

    await runCommand(finalCmd);

    await query(
      "INSERT INTO delivered_rewards (reward_hash) VALUES ($1)",
      [h]
    );

  } catch (e) {
    console.warn("Queueing reward (server offline)");

    await query(`
      INSERT INTO reward_queue
      (discord_id, minecraft_name, command, reward_hash, status, created_at)
      VALUES ($1,$2,$3,$4,'pending',$5)
    `, [discordId, mcName, finalCmd, h, Date.now()]);
  }
}

// =====================
// QUEUE WORKER
// =====================
setInterval(async () => {
  try {
    const res = await query(`
      SELECT * FROM reward_queue
      WHERE status='pending'
      LIMIT 20
    `);

    for (const r of res.rows) {
      try {
        await runCommand(r.command);

        await query(
          "UPDATE reward_queue SET status='delivered' WHERE id=$1",
          [r.id]
        );

        await query(
          "INSERT INTO delivered_rewards (reward_hash)
           VALUES ($1)
           ON CONFLICT DO NOTHING",
          [r.reward_hash]
        );

      } catch {}
    }
  } catch (e) {
    console.error("Queue worker error:", e);
  }
}, 5000);

// =====================
// COMMANDS
// =====================
const commands = [

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link MC")
    .addStringOption(o =>
      o.setName("username").setRequired(true)),

  new SlashCommandBuilder().setName("stats").setDescription("Stats"),
  new SlashCommandBuilder().setName("shop").setDescription("Shop"),
  new SlashCommandBuilder().setName("roll").setDescription("Spin"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy")
    .addStringOption(o => o.setName("item").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Admin")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Admin")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setluck")
    .setDescription("Admin")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addNumberOption(o => o.setName("amount").setRequired(true))
];

// =====================
// REGISTER
// =====================
async function register() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands.map(c => c.toJSON()) }
  );

  console.log("✅ Commands registered");
}

// =====================
// READY FIX (NO DEPRECATION ISSUES)
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await register();
});

// =====================
// INTERACTIONS (FULL SAFE MODE)
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  await i.deferReply({ ephemeral: true });

  let u;

  try {
    u = await getUser(i.user.id);
  } catch {
    return safeReply(i, "❌ DB error");
  }

  const isAdmin = i.memberPermissions?.has("Administrator");

  // =====================
  // VERIFY
  // =====================
  if (i.commandName === "verify") {
    const name = i.options.getString("username");

    try {
      await query(`
        INSERT INTO users (discord_id, minecraft_name)
        VALUES ($1,$2)
        ON CONFLICT (discord_id)
        DO UPDATE SET minecraft_name=$2
      `, [i.user.id, name]);

      return safeReply(i, `✅ Linked ${name}`);
    } catch {
      return safeReply(i, "❌ verify failed");
    }
  }

  // =====================
  // STATS
  // =====================
  if (i.commandName === "stats") {
    return safeReply(i,
`💬 ${u.messages}
🎟 ${u.spins}
🍀 ${u.luck_multi}`);
  }

  // =====================
  // SHOP
  // =====================
  if (i.commandName === "shop") {
    return safeReply(i,
`🛒 spin x1 = 20 msgs
spin x5 = 80 msgs
luck x5 = 500 msgs`);
  }

  // =====================
  // BUY
  // =====================
  if (i.commandName === "buy") {
    const item = i.options.getString("item");
    const amount = i.options.getInteger("amount");

    try {
      if (item === "spin") {
        await query(`
          UPDATE users
          SET messages = messages - ($1 * 20),
              spins = spins + $1
          WHERE discord_id=$2
        `, [amount, i.user.id]);
      }

      if (item === "luck") {
        await query(`
          UPDATE users
          SET messages = messages - ($1 * 100),
              luck_multi = luck_multi + $1
          WHERE discord_id=$2
        `, [amount, i.user.id]);
      }

      return safeReply(i, "✅ purchased");
    } catch {
      return safeReply(i, "❌ buy failed");
    }
  }

  // =====================
  // ROLL (SAFE)
  // =====================
  if (i.commandName === "roll") {
    try {
      if (!u.minecraft_name)
        return safeReply(i, "❌ verify first");

      const pool = config.reward.pool;
      let total = pool.reduce((a,b)=>a+b.chance,0);
      let r = Math.random() * total;

      let reward;

      for (const p of pool) {
        if (r < p.chance) {
          reward = p;
          break;
        }
        r -= p.chance;
      }

      await deliverReward(i.user.id, u.minecraft_name, reward.cmd);

      return safeReply(i, "🎰 rolling...");
    } catch {
      return safeReply(i, "❌ roll failed");
    }
  }

  // =====================
  // ADMIN
  // =====================
  if (!isAdmin) return;

  if (i.commandName === "setspins") {
    await query("UPDATE users SET spins=$1 WHERE discord_id=$2", [
      i.options.getInteger("amount"),
      i.options.getUser("user").id
    ]);
  }

  if (i.commandName === "setmessages") {
    await query("UPDATE users SET messages=$1 WHERE discord_id=$2", [
      i.options.getInteger("amount"),
      i.options.getUser("user").id
    ]);
  }

  if (i.commandName === "setluck") {
    await query("UPDATE users SET luck_multi=$1 WHERE discord_id=$2", [
      i.options.getNumber("amount"),
      i.options.getUser("user").id
    ]);
  }
});

// =====================
client.login(process.env.TOKEN);