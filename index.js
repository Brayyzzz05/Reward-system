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
// SLOT SYMBOLS
// =====================
const symbols = ["🍒","💎","🪙","🔥","⭐","🪽"];

// =====================
// LUCK
// =====================
function getLuck(user) {
  let mult = 1;
  const name = user.mc_username?.toLowerCase();

  if (config.reward.luckyUsers?.[name]) {
    mult *= config.reward.luckyUsers[name];
  }

  if (config.reward.devMode && config.reward.devUsers?.[name]) {
    mult *= config.reward.devUsers[name];
  }

  const day = new Date().getDay();
  if (day === 6 || day === 0) mult *= 2;

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
  new SlashCommandBuilder().setName("verify")
    .setDescription("Link MC")
    .addStringOption(o=>o.setName("username").setRequired(true)),

  new SlashCommandBuilder().setName("roll").setDescription("Roll"),
  new SlashCommandBuilder().setName("daily").setDescription("Daily"),
  new SlashCommandBuilder().setName("stats").setDescription("Stats")
].map(c=>c.toJSON());

// =====================
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("Bot ready");
});

// =====================
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  await i.deferReply();

  const id = i.user.id;
  const now = Date.now();

  let user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);

  if (!user) {
    db.prepare(`
      INSERT INTO users (discord_id, spins, messages)
      VALUES (?,0,0)
    `).run(id);

    user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);
  }

  // VERIFY
  if (i.commandName === "verify") {
    const name = i.options.getString("username");
    db.prepare("UPDATE users SET mc_username=? WHERE discord_id=?")
      .run(name,id);

    return i.editReply("✅ linked");
  }

  // ROLL
  if (i.commandName === "roll") {

    if ((user.spins||0)<=0)
      return i.editReply("❌ no spins");

    db.prepare("UPDATE users SET spins=spins-1 WHERE discord_id=?")
      .run(id);

    let msg = await i.editReply("🎰 spinning...");

    for (let t=0;t<3;t++){
      const spin = `${symbols[Math.random()*6|0]} ${symbols[Math.random()*6|0]} ${symbols[Math.random()*6|0]}`;
      await new Promise(r=>setTimeout(r,300));
      await msg.edit(spin);
    }

    // 🎯 OWNER GUARANTEE
    let reward;

    if (
      config.reward.guaranteedUltra.enabled &&
      id === config.reward.guaranteedUltra.discordId
    ) {
      reward = "give {player} netherite_ingot 1";
    } else {
      const luck = getLuck(user);
      const roll = Math.random() / luck;

      if (roll < 0.00001) {
        reward = "give {player} elytra 1";
      } else {
        reward = getReward(config.reward.pool);
      }
    }

    const cmd = reward.replace("{player}", user.mc_username || "player");

    return msg.edit(`🎁 ${cmd}`);
  }

  // DAILY
  if (i.commandName === "daily") {
    db.prepare("UPDATE users SET spins=spins+2 WHERE discord_id=?")
      .run(id);

    return i.editReply("🎁 +2 spins");
  }

  // STATS
  if (i.commandName === "stats") {
    return i.editReply(`🎟️ ${user.spins||0} spins`);
  }
});

// =====================
// MESSAGE SYSTEM
// =====================
client.on("messageCreate", msg=>{
  if (msg.author.bot) return;

  const id = msg.author.id;

  let user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);

  if (!user) {
    db.prepare("INSERT INTO users (discord_id) VALUES (?)").run(id);
    user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);
  }

  const now = Date.now();
  const cd = config.cooldowns.message * 1000;

  if (now - (user.last_message||0) < cd) return;

  const count = (user.messages||0)+1;

  db.prepare(`
    UPDATE users SET messages=?, last_message=? WHERE discord_id=?
  `).run(count,now,id);

  if (count >= config.reward.messagesRequired) {
    db.prepare(`
      UPDATE users SET spins=spins+1, messages=0 WHERE discord_id=?
    `).run(id);

    msg.reply("🎟️ +1 spin");
  }
});

client.login(process.env.TOKEN);