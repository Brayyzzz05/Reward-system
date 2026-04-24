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
// GUARANTEE
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
// REWARD
// =====================
function getReward(pool, luck) {
  const adjusted = pool.map(item => ({
    ...item,
    chance: item.chance * luck
  }));

  const total = adjusted.reduce((a,b)=>a+b.chance,0);
  let r = Math.random() * total;

  for (const item of adjusted) {
    if (r < item.chance) return item;
    r -= item.chance;
  }
}

// =====================
// RARITY
// =====================
function getRarity(chance) {
  if (chance <= 10) return "👑 Jackpot";
  if (chance <= 50) return "🌟 Ultra";
  if (chance <= 200) return "💀 Mythic";
  if (chance <= 2000) return "🔥 Very Rare";
  if (chance <= 15000) return "💎 Rare";
  if (chance <= 90000) return "🪙 Uncommon";
  return "🌿 Common";
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link MC account")
    .addStringOption(o =>
      o.setName("username").setDescription("Minecraft username").setRequired(true)
    ),

  new SlashCommandBuilder().setName("roll").setDescription("Spin rewards"),

  new SlashCommandBuilder().setName("daily").setDescription("Get spins"),

  new SlashCommandBuilder().setName("stats").setDescription("View stats"),

  new SlashCommandBuilder().setName("shop").setDescription("Open shop"),

  new SlashCommandBuilder().setName("odds").setDescription("View drop chances"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("item")
        .setRequired(true)
        .addChoices(
          { name: "Luck x1.5 (100)", value: "luck1" },
          { name: "Luck x2 (250)", value: "luck2" },
          { name: "+5 Spins (80)", value: "spin5" },
          { name: "+1 Spin (20)", value: "spin1" }
        )
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("how many")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Set spins")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Set messages")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true))

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

  console.log("🤖 READY FINAL SHOP BUILD");
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async i => {

  // =====================
  // BUTTON SHOP
  // =====================
  if (i.isButton()) {

    const id = i.user.id;

    db.prepare("INSERT OR IGNORE INTO users (discord_id) VALUES (?)").run(id);
    const user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);

    let cost = 0, luckGain = 0, spinsGain = 0;

    if (i.customId === "luck1") { cost = 100; luckGain = 0.5; }
    if (i.customId === "luck2") { cost = 250; luckGain = 1; }
    if (i.customId === "spin5") { cost = 80; spinsGain = 5; }
    if (i.customId === "spin1") { cost = 20; spinsGain = 1; }

    if (user.messages < cost) {
      return i.reply({ content: "❌ Not enough messages", ephemeral: true });
    }

    db.prepare(`
      UPDATE users
      SET messages=messages-?,
          luck_multi=luck_multi+?,
          spins=spins+?
      WHERE discord_id=?
    `).run(cost, luckGain, spinsGain, id);

    return i.reply({ content: "✅ Purchased", ephemeral: true });
  }

  // =====================
  // SLASH COMMANDS
  // =====================
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

  // SHOP (INTERACTIVE)
  if (i.commandName === "shop") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("luck1").setLabel("Luck x1.5 (100)").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("luck2").setLabel("Luck x2 (250)").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("spin5").setLabel("+5 Spins (80)").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("spin1").setLabel("+1 Spin (20)").setStyle(ButtonStyle.Success)
    );

    return i.reply({
      content: "🛒 Click to buy:",
      components: [row]
    });
  }

  // MASS BUY
  if (i.commandName === "buy") {
    const item = i.options.getString("item");
    const amount = i.options.getInteger("amount") || 1;

    let cost = 0, luckGain = 0, spinsGain = 0;

    if (item === "luck1") { cost = 100; luckGain = 0.5; }
    if (item === "luck2") { cost = 250; luckGain = 1; }
    if (item === "spin5") { cost = 80; spinsGain = 5; }
    if (item === "spin1") { cost = 20; spinsGain = 1; }

    const totalCost = cost * amount;

    if (user.messages < totalCost) {
      return i.reply("❌ Not enough messages");
    }

    db.prepare(`
      UPDATE users
      SET messages=messages-?,
          luck_multi=luck_multi+?,
          spins=spins+?
      WHERE discord_id=?
    `).run(
      totalCost,
      luckGain * amount,
      spinsGain * amount,
      id
    );

    return i.reply(`✅ Bought x${amount}`);
  }

  // ROLL (ANIMATED)
  if (i.commandName === "roll") {
    if (user.spins <= 0) return i.reply("❌ No spins");

    db.prepare("UPDATE users SET spins=spins-1 WHERE discord_id=?").run(id);

    await i.reply("🎰 Spinning...");

    const frames = ["🍒","💎","🪙","🔥","⭐","🪽"];

    for (let x = 0; x < 3; x++) {
      await new Promise(r => setTimeout(r, 300));
      await i.editReply(
        `🎰 ${frames[Math.floor(Math.random()*6)]} | ${frames[Math.floor(Math.random()*6)]} | ${frames[Math.floor(Math.random()*6)]}`
      );
    }

    const pool = applyGuarantee(config.reward.pool);
    const reward = getReward(pool, user.luck_multi);

    const cmd = reward.cmd.replace("{player}", user.mc_username || "player");

    return i.editReply(`🎉 ${cmd}`);
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
});

// =====================
// MESSAGE SYSTEM
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
    UPDATE users SET messages=messages+1, last_message=?
    WHERE discord_id=?
  `).run(now, id);
});

client.login(process.env.TOKEN);