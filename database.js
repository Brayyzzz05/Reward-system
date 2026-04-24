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
// GLOBAL SAFETY
// =====================
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// =====================
// DB WRAPPER
// =====================
const query = (q, p = []) => db.query(q, p);

// =====================
// RCON (YOU MUST HAVE THIS)
// =====================
async function runCommand(cmd) {
  if (!global.rconSend) throw new Error("RCON not set");
  return global.rconSend(cmd);
}

// =====================
// USER FETCH
// =====================
async function getUser(id) {
  await query(`
    INSERT INTO users (discord_id)
    VALUES ($1)
    ON CONFLICT DO NOTHING
  `, [id]);

  const r = await query(
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

  await query(`
    INSERT INTO users (discord_id, messages)
    VALUES ($1, 1)
    ON CONFLICT (discord_id)
    DO UPDATE SET messages = users.messages + 1
  `, [m.author.id]);
});

// =====================
// HASH SYSTEM (ANTI DUPE)
// =====================
function hash(id, cmd) {
  return crypto
    .createHash("sha256")
    .update(id + cmd + Date.now())
    .digest("hex");
}

// =====================
// REWARD DELIVERY (ONLINE OR QUEUE)
// =====================
async function deliverReward(discordId, mcName, cmd) {
  const finalCmd = cmd.replace("{player}", mcName);
  const h = hash(discordId, finalCmd);

  const exists = await query(
    "SELECT * FROM delivered_rewards WHERE reward_hash=$1",
    [h]
  );

  if (exists.rows.length > 0) return;

  try {
    await runCommand(finalCmd);

    await query(
      "INSERT INTO delivered_rewards (reward_hash) VALUES ($1)",
      [h]
    );

  } catch (e) {
    await query(`
      INSERT INTO reward_queue
      (discord_id, minecraft_name, command, reward_hash, status, created_at)
      VALUES ($1,$2,$3,$4,'pending',$5)
    `, [discordId, mcName, finalCmd, h, Date.now()]);
  }
}

// =====================
// QUEUE WORKER (OFFLINE SUPPORT)
// =====================
setInterval(async () => {
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

    } catch (e) {
      // still offline → keep waiting
    }
  }
}, 4000);

// =====================
// COMMANDS
// =====================
const commands = [

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link Minecraft")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("MC name")
        .setRequired(true)
    ),

  new SlashCommandBuilder().setName("stats").setDescription("Stats"),
  new SlashCommandBuilder().setName("shop").setDescription("Shop"),
  new SlashCommandBuilder().setName("roll").setDescription("Spin"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)),

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
];

// =====================
// REGISTER COMMANDS
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

  console.log("✅ Commands loaded");
}

// =====================
// READY
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await register();
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

    await query(`
      INSERT INTO users (discord_id, minecraft_name)
      VALUES ($1,$2)
      ON CONFLICT (discord_id)
      DO UPDATE SET minecraft_name=$2
    `, [i.user.id, name]);

    return i.reply(`✅ Linked ${name}`);
  }

  // =====================
  // STATS
  // =====================
  if (i.commandName === "stats") {
    return i.reply(
`💬 ${u.messages}
🎟 ${u.spins}
🍀 ${u.luck_multi}`
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
  // BUY
  // =====================
  if (i.commandName === "buy") {
    const item = i.options.getString("item");
    const amount = i.options.getInteger("amount");

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

    return i.reply("✅ Purchased");
  }

  // =====================
  // ROLL
  // =====================
  if (i.commandName === "roll") {
    if (!u.minecraft_name)
      return i.reply("❌ /verify first");

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

    return i.reply("🎰 rolling reward...");
  }

  // =====================
  // ADMIN COMMANDS
  // =====================
  if (!isAdmin) return;

  if (i.commandName === "setspins") {
    await query(
      "UPDATE users SET spins=$1 WHERE discord_id=$2",
      [i.options.getInteger("amount"), i.options.getUser("user").id]
    );
  }

  if (i.commandName === "setmessages") {
    await query(
      "UPDATE users SET messages=$1 WHERE discord_id=$2",
      [i.options.getInteger("amount"), i.options.getUser("user").id]
    );
  }

  if (i.commandName === "setluck") {
    await query(
      "UPDATE users SET luck_multi=$1 WHERE discord_id=$2",
      [i.options.getNumber("amount"), i.options.getUser("user").id]
    );
  }
});

// =====================
client.login(process.env.TOKEN);