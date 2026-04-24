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
// RCON (KEEP YOUR EXISTING ONE)
// =====================
async function runCommand(cmd) {
  // 🔴 replace this with your real RCON function if already exists
  // for now we assume it's globally available or imported elsewhere

  if (!global.rconSend) throw new Error("RCON not set");

  return global.rconSend(cmd);
}

// =====================
// USER GET / CREATE
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
// MESSAGE TRACKER
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
// REWARD SYSTEM (INLINE)
// =====================
function makeHash(id, cmd) {
  return require("crypto")
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

  // ❌ anti-dupe
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

    console.log("⚡ DELIVERED:", finalCmd);

  } catch (e) {
    await db(`
      INSERT INTO reward_queue
      (discord_id, minecraft_name, command, status, reward_hash, created_at)
      VALUES ($1,$2,$3,'pending',$4,$5)
    `, [discordId, mcName, finalCmd, hash, Date.now()]);

    console.log("📦 QUEUED:", finalCmd);
  }
}

// =====================
// QUEUE WORKER (offline retry)
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

      console.log("🎁 SENT:", row.command);

    } catch (e) {
      // still offline
    }
  }
}, 3000);

// =====================
// COMMANDS
// =====================
const commands = [];

commands.push(
  new SlashCommandBuilder().setName("stats").setDescription("View stats"),
  new SlashCommandBuilder().setName("roll").setDescription("Spin rewards"),
  new SlashCommandBuilder().setName("shop").setDescription("Shop"),
  new SlashCommandBuilder().setName("verify")
    .setDescription("Link Minecraft")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("MC name")
        .setRequired(true)
    )
);

// =====================
// REGISTER
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

  // VERIFY
  if (i.commandName === "verify") {
    const name = i.options.getString("username");

    await db(`
      UPDATE users
      SET minecraft_name=$1
      WHERE discord_id=$2
    `, [name, i.user.id]);

    return i.reply(`✅ Linked: ${name}`);
  }

  // STATS
  if (i.commandName === "stats") {
    return i.reply(
      `💬 ${u.messages} msgs\n🎟 ${u.spins} spins\n🍀 ${u.luck_multi} luck`
    );
  }

  // SHOP
  if (i.commandName === "shop") {
    return i.reply(
`🛒 SHOP
spin x1 = 20 msgs
spin x5 = 80 msgs
luck x5 = 500 msgs`
    );
  }

  // ROLL
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

    return i.reply("🎰 rolling reward...");
  }
});

// =====================
client.login(process.env.TOKEN);