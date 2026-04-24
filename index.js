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
// GUARANTEE SYSTEM
// =====================
function applyGuarantee(pool) {
  const g = config.guaranteedRewards;

  if (g.guaranteedJackpotPlus.enabled) return pool.filter(i => i.chance <= 10);
  if (g.guaranteedUltraPlus.enabled) return pool.filter(i => i.chance <= 50);
  if (g.guaranteedMythicPlus.enabled) return pool.filter(i => i.chance <= 200);
  if (g.guaranteedVeryRarePlus.enabled) return pool.filter(i => i.chance <= 2000);
  if (g.guaranteedRarePlus.enabled) return pool.filter(i => i.chance <= 15000);
  if (g.guaranteedUncommonPlus.enabled) return pool.filter(i => i.chance <= 90000);

  return pool;
}

// =====================
// REWARD ROLL
// =====================
function getReward(pool, luck) {
  const adjusted = pool.map(item => ({
    ...item,
    chance: item.chance * luck
  }));

  const total = adjusted.reduce((a,b)=>a+b.chance,0);
  let r = Math.random() * total;

  for (const item of adjusted) {
    if (r < item.chance) return item.cmd;
    r -= item.chance;
  }
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

  new SlashCommandBuilder().setName("roll").setDescription("Spin rewards"),

  new SlashCommandBuilder().setName("daily").setDescription("Get spins"),

  new SlashCommandBuilder().setName("stats").setDescription("View stats"),

  new SlashCommandBuilder().setName("shop").setDescription("Open shop"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("item")
        .setRequired(true)
        .addChoices(
          { name: "Luck x1.5 (100 messages)", value: "luck1" },
          { name: "Luck x2 (250 messages)", value: "luck2" },
          { name: "+5 Spins (80 messages)", value: "spin5" },
          { name: "+1 Spin (20 messages)", value: "spin1" }
        )
    ),

  new SlashCommandBuilder()
    .setName("givespins")
    .setDescription("Give spins (admin)")
    .addUserOption(o =>
      o.setName("user").setDescription("target").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("amount").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("givemessages")
    .setDescription("Give messages (admin)")
    .addUserOption(o =>
      o.setName("user").setDescription("target").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("amount").setRequired(true)
    )

].map(c => c.toJSON());

// =====================
// READY
// =====================
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("🤖 BOT READY");
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const id = i.user.id;

  db.prepare("INSERT OR IGNORE INTO users (discord_id) VALUES (?)").run(id);
  const user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);

  // VERIFY
  if (i.commandName === "verify") {
    const name = i.options.getString("username");
    db.prepare("UPDATE users SET mc_username=? WHERE discord_id=?").run(name, id);
    return i.reply("✅ linked");
  }

  // DAILY
  if (i.commandName === "daily") {
    db.prepare("UPDATE users SET spins=spins+2 WHERE discord_id=?").run(id);
    return i.reply("🎁 +2 spins");
  }

  // STATS
  if (i.commandName === "stats") {
    return i.reply(
`🎟️ Rolls: ${user.spins}
🍀 Luck: x${user.luck_multi}
💬 Messages: ${user.messages}`
    );
  }

  // SHOP
  if (i.commandName === "shop") {
    return i.reply(
`🛒 Shop:
💬 100 → Luck x1.5
💬 250 → Luck x2
💬 80 → +5 Spins
💬 20 → +1 Spin`
    );
  }

  // BUY
  if (i.commandName === "buy") {
    const item = i.options.getString("item");

    let cost = 0, luckGain = 0, spinsGain = 0;

    if (item === "luck1") { cost = 100; luckGain = 0.5; }
    if (item === "luck2") { cost = 250; luckGain = 1; }
    if (item === "spin5") { cost = 80; spinsGain = 5; }
    if (item === "spin1") { cost = 20; spinsGain = 1; }

    if (user.messages < cost) return i.reply("❌ Not enough messages");

    db.prepare(`
      UPDATE users
      SET messages=messages-?,
          luck_multi=luck_multi+?,
          spins=spins+?
      WHERE discord_id=?
    `).run(cost, luckGain, spinsGain, id);

    return i.reply("✅ Purchased");
  }

  // ADMIN: GIVE SPINS
  if (i.commandName === "givespins") {
    if (!i.member.permissions.has("Administrator")) {
      return i.reply({ content: "❌ Admin only", ephemeral: true });
    }

    const target = i.options.getUser("user");
    const amount = i.options.getInteger("amount");

    db.prepare("INSERT OR IGNORE INTO users (discord_id) VALUES (?)").run(target.id);

    db.prepare("UPDATE users SET spins=spins+? WHERE discord_id=?")
      .run(amount, target.id);

    return i.reply(`✅ Gave ${amount} spins`);
  }

  // ADMIN: GIVE MESSAGES
  if (i.commandName === "givemessages") {
    if (!i.member.permissions.has("Administrator")) {
      return i.reply({ content: "❌ Admin only", ephemeral: true });
    }

    const target = i.options.getUser("user");
    const amount = i.options.getInteger("amount");

    db.prepare("INSERT OR IGNORE INTO users (discord_id) VALUES (?)").run(target.id);

    db.prepare("UPDATE users SET messages=messages+? WHERE discord_id=?")
      .run(amount, target.id);

    return i.reply(`✅ Gave ${amount} messages`);
  }

  // ROLL
  if (i.commandName === "roll") {
    if (user.spins <= 0) return i.reply("❌ No spins");

    db.prepare("UPDATE users SET spins=spins-1 WHERE discord_id=?").run(id);

    const pool = applyGuarantee(config.reward.pool);
    const reward = getReward(pool, user.luck_multi);

    const cmd = reward.replace("{player}", user.mc_username || "player");

    return i.reply(`🎁 ${cmd}`);
  }
});

// =====================
// MESSAGE SYSTEM (CURRENCY ONLY)
// =====================
client.on("messageCreate", msg => {
  if (msg.author.bot) return;

  const id = msg.author.id;

  db.prepare("INSERT OR IGNORE INTO users (discord_id) VALUES (?)").run(id);

  const user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);

  const now = Date.now();
  const cd = config.cooldowns.message * 1000;

  if (now - (user.last_message || 0) < cd) return;

  db.prepare(`
    UPDATE users
    SET messages = messages + 1,
        last_message = ?
    WHERE discord_id = ?
  `).run(now, id);
});

client.login(process.env.TOKEN);