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
// DB
// =====================
async function db(q, p = []) {
  return pool.query(q, p);
}

// =====================
// RCON (REPLACE WITH YOUR SYSTEM)
// =====================
async function runCommand(cmd) {
  if (!global.rconSend) throw new Error("RCON not set");
  return global.rconSend(cmd);
}

// =====================
// USER GET/CREATE
// =====================
async function getUser(id) {
  await db(`
    INSERT INTO users (discord_id)
    VALUES ($1)
    ON CONFLICT DO NOTHING
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
// HASH (ANTI DUPE)
// =====================
function makeHash(id, cmd) {
  return crypto
    .createHash("sha256")
    .update(id + cmd + Date.now())
    .digest("hex");
}

// =====================
// DELIVERY SYSTEM
// =====================
async function deliverReward(discordId, mcName, cmd) {
  const finalCmd = cmd.replace("{player}", mcName);
  const hash = makeHash(discordId, finalCmd);

  const check = await db(
    "SELECT * FROM delivered_rewards WHERE reward_hash=$1",
    [hash]
  );

  if (check.rows.length > 0) return;

  try {
    await runCommand(finalCmd);

    await db(
      "INSERT INTO delivered_rewards (reward_hash) VALUES ($1)",
      [hash]
    );

  } catch (e) {
    await db(`
      INSERT INTO reward_queue
      (discord_id, minecraft_name, command, status, reward_hash, created_at)
      VALUES ($1,$2,$3,'pending',$4,$5)
    `, [discordId, mcName, finalCmd, hash, Date.now()]);
  }
}

// =====================
// QUEUE WORKER
// =====================
setInterval(async () => {
  const res = await db(`
    SELECT * FROM reward_queue
    WHERE status='pending'
    LIMIT 20
  `);

  for (const row of res.rows) {
    try {
      await runCommand(row.command);

      await db(
        "UPDATE reward_queue SET status='delivered' WHERE id=$1",
        [row.id]
      );

      await db(
        "INSERT INTO delivered_rewards (reward_hash)
         VALUES ($1)
         ON CONFLICT DO NOTHING",
        [row.reward_hash]
      );

    } catch (e) {}
  }
}, 3000);

// =====================
// COMMANDS
// =====================
const commands = [];

// USER COMMANDS
commands.push(
  new SlashCommandBuilder().setName("stats").setDescription("View stats"),
  new SlashCommandBuilder().setName("shop").setDescription("Shop"),
  new SlashCommandBuilder().setName("roll").setDescription("Spin rewards"),
  new SlashCommandBuilder().setName("daily").setDescription("Daily reward"),
  new SlashCommandBuilder().setName("odds").setDescription("View odds"),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link Minecraft")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("MC name")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true))
);

// ADMIN COMMANDS
commands.push(
  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Admin set spins")
    .addUserOption(o =>
      o.setName("user").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Admin set messages")
    .addUserOption(o =>
      o.setName("user").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setluck")
    .setDescription("Admin set luck")
    .addUserOption(o =>
      o.setName("user").setRequired(true))
    .addNumberOption(o =>
      o.setName("amount").setRequired(true))
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
    { body: commands.map(c => c.toJSON()) }
  );

  console.log("✅ Commands registered");
}

// =====================
// READY
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await registerCommands();
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const u = await getUser(i.user.id);
  const isAdmin = i.memberPermissions?.has("Administrator");

  // =====================
  // VERIFY
  // =====================
  if (i.commandName === "verify") {
    const name = i.options.getString("username");

    await db(
      "UPDATE users SET minecraft_name=$1 WHERE discord_id=$2",
      [name, i.user.id]
    );

    return i.reply(`✅ Linked ${name}`);
  }

  // =====================
  // STATS
  // =====================
  if (i.commandName === "stats") {
    return i.reply(
      `💬 Messages: ${u.messages}
🎟 Spins: ${u.spins}
🍀 Luck: ${u.luck_multi}`
    );
  }

  // =====================
  // SHOP
  // =====================
  if (i.commandName === "shop") {
    return i.reply(
`🛒 SHOP
spin x1 = 20 msgs
spin x5 = 80 msgs
luck x5 = 500 msgs`
    );
  }

  // =====================
  // DAILY (24h)
  // =====================
  if (i.commandName === "daily") {
    const now = Date.now();

    if (u.last_daily && now - u.last_daily < 86400000)
      return i.reply("⏳ cooldown");

    await db(`
      UPDATE users
      SET spins = spins + 2,
          last_daily = $1
      WHERE discord_id=$2
    `, [now, i.user.id]);

    return i.reply("🎁 +2 spins");
  }

  // =====================
  // BUY
  // =====================
  if (i.commandName === "buy") {
    const item = i.options.getString("item");
    const amount = i.options.getInteger("amount");

    if (item === "spin") {
      await db(
        "UPDATE users SET spins = spins + $1, messages = messages - 20 WHERE discord_id=$2",
        [amount, i.user.id]
      );
    }

    if (item === "luck") {
      await db(
        "UPDATE users SET luck_multi = luck_multi + $1, messages = messages - 100 WHERE discord_id=$2",
        [amount, i.user.id]
      );
    }

    return i.reply("✅ Purchased");
  }

  // =====================
  // ROLL
  // =====================
  if (i.commandName === "roll") {
    if (!u.minecraft_name)
      return i.reply("❌ /verify first");

    if (u.spins <= 0)
      return i.reply("❌ no spins");

    await db(
      "UPDATE users SET spins = spins - 1 WHERE discord_id=$1",
      [i.user.id]
    );

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

    return i.reply("🎰 rolled reward");
  }

  // =====================
  // ADMIN
  // =====================
  if (!isAdmin) return;

  if (i.commandName === "setspins") {
    await db(
      "UPDATE users SET spins=$1 WHERE discord_id=$2",
      [i.options.getInteger("amount"), i.options.getUser("user").id]
    );
  }

  if (i.commandName === "setmessages") {
    await db(
      "UPDATE users SET messages=$1 WHERE discord_id=$2",
      [i.options.getInteger("amount"), i.options.getUser("user").id]
    );
  }

  if (i.commandName === "setluck") {
    await db(
      "UPDATE users SET luck_multi=$1 WHERE discord_id=$2",
      [i.options.getNumber("amount"), i.options.getUser("user").id]
    );
  }
});

// =====================
client.login(process.env.TOKEN);