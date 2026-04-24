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
// SAFE RCON (NO FREEZE)
// =====================
async function safeSend(cmd) {
  try {
    if (!rcon) return;

    await Promise.race([
      rcon.send(cmd),
      new Promise((_, rej) => setTimeout(rej, 2000))
    ]);
  } catch {}
}

// =====================
// SLOT SYMBOLS
// =====================
const symbols = ["🍒","💎","🪙","🔥","⭐","🪽"];

// =====================
// LUCK SYSTEM
// =====================
function getLuck(user, member) {
  let mult = 1;

  const name = user.mc_username?.toLowerCase();

  if (config.reward.luckyUsers?.[name]) {
    mult *= config.reward.luckyUsers[name];
  }

  const day = new Date().getDay();
  if (day === 6 || day === 0) mult *= 2;

  const dbUser = db.prepare(
    "SELECT luck_mode FROM users WHERE discord_id=?"
  ).get(user.discord_id);

  const isAdmin = member?.permissions?.has("Administrator");

  if (isAdmin && dbUser?.luck_mode === 1) {
    mult *= config.reward.adminLuckMultiplier;
  }

  return mult;
}

// =====================
// REWARD PICK
// =====================
function getReward(pool) {
  const total = pool.reduce((a,b)=>a+b.chance,0);
  let r = Math.random()*total;

  for (const item of pool) {
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
    .addStringOption(opt =>
      opt.setName("username")
        .setDescription("Minecraft username")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Spin rewards"),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Get spins"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View stats"),

  new SlashCommandBuilder()
    .setName("luckmode")
    .setDescription("Toggle admin luck")
    .addStringOption(opt =>
      opt.setName("state")
        .setDescription("on/off")
        .setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" }
        )
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

  console.log("🤖 Bot ready (FAST MODE)");
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const id = i.user.id;

  let user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);

  if (!user) {
    db.prepare("INSERT INTO users (discord_id) VALUES (?)").run(id);
    user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);
  }

  // =====================
  // VERIFY
  // =====================
  if (i.commandName === "verify") {
    const name = i.options.getString("username");

    db.prepare("UPDATE users SET mc_username=? WHERE discord_id=?")
      .run(name, id);

    return i.reply({ content: "✅ linked", ephemeral: true });
  }

  // =====================
  // LUCK MODE
  // =====================
  if (i.commandName === "luckmode") {

    if (!i.member.permissions.has("Administrator")) {
      return i.reply({ content: "❌ Admin only", ephemeral: true });
    }

    const state = i.options.getString("state");
    const value = state === "on" ? 1 : 0;

    db.prepare("UPDATE users SET luck_mode=? WHERE discord_id=?")
      .run(value, id);

    return i.reply({
      content: value ? "🍀 ON" : "🍀 OFF",
      ephemeral: true
    });
  }

  // =====================
  // DAILY
  // =====================
  if (i.commandName === "daily") {
    db.prepare("UPDATE users SET spins=spins+2 WHERE discord_id=?")
      .run(id);

    return i.reply("🎁 +2 spins");
  }

  // =====================
  // STATS
  // =====================
  if (i.commandName === "stats") {
    return i.reply(`🎟️ spins: ${user.spins || 0}`);
  }

  // =====================
  // ROLL (INSTANT RESPONSE)
  // =====================
  if (i.commandName === "roll") {

    if ((user.spins || 0) <= 0) {
      return i.reply("❌ No spins");
    }

    // ⚡ INSTANT RESPONSE
    await i.reply("🎰 spinning...");

    // ⚡ BACKGROUND WORK
    setImmediate(async () => {

      try {
        db.prepare("UPDATE users SET spins=spins-1 WHERE discord_id=?")
          .run(id);

        // fake animation delay
        await new Promise(r => setTimeout(r, 600));

        let reward;

        // 🎯 GUARANTEED ULTRA
        if (
          config.reward.guaranteedUltra.enabled &&
          id === config.reward.guaranteedUltra.discordId
        ) {
          reward = "give {player} netherite_ingot 1";
        } else {
          const luck = getLuck(user, i.member);
          const roll = Math.random() / luck;

          reward =
            roll < 0.00001
              ? "give {player} elytra 1"
              : getReward(config.reward.pool);
        }

        const cmd = reward.replace("{player}", user.mc_username || "player");

        await safeSend(cmd);

        await i.editReply(`🎁 ${cmd}`);

      } catch (e) {
        console.error(e);
        await i.editReply("❌ error");
      }
    });
  }
});

// =====================
// MESSAGE SYSTEM (FAST)
// =====================
client.on("messageCreate", msg => {
  if (msg.author.bot) return;

  const id = msg.author.id;

  let user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);

  if (!user) {
    db.prepare("INSERT INTO users (discord_id) VALUES (?)").run(id);
    user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);
  }

  const now = Date.now();
  const cd = config.cooldowns.message * 1000;

  if (now - (user.last_message || 0) < cd) return;

  const count = (user.messages || 0) + 1;

  db.prepare(`
    UPDATE users SET messages=?, last_message=? WHERE discord_id=?
  `).run(count, now, id);

  if (count >= config.reward.messagesRequired) {
    db.prepare(`
      UPDATE users SET spins=spins+1, messages=0 WHERE discord_id=?
    `).run(id);

    msg.reply("🎟️ +1 spin");
  }
});

client.login(process.env.TOKEN);