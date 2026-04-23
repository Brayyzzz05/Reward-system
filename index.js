import 'dotenv/config';
import { Client, GatewayIntentBits } from "discord.js";
import db from "./database.js";
import config from "./config.js";
import { Rcon } from "rcon-client";

// 🌏 Weekend checker (Singapore time)
function isWeekend() {
  const now = new Date();

  // convert to Singapore time
  const sgTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Singapore" })
  );

  const day = sgTime.getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

// ⚡ Base luck system
function getLuckMultiplier(userId, config) {
  const base = config.reward.luckyUsers?.[userId] || 1;

  const devBoost =
    config.reward.devMode
      ? (config.reward.devUsers?.[userId] || 1)
      : 1;

  const weekendBoost = isWeekend() ? 2 : 1;

  return base * devBoost * weekendBoost;
}

// 🎲 Weighted reward picker
function getRandomReward(pool, multiplier = 1) {
  const totalWeight = pool.reduce(
    (sum, item) => sum + item.chance * multiplier,
    0
  );

  let random = Math.random() * totalWeight;

  for (const item of pool) {
    const weight = item.chance * multiplier;
    if (random < weight) return item.cmd;
    random -= weight;
  }
}

// 🎰 Special rewards (elytra + jackpot)
function rollSpecialRewards(player, multiplier = 1) {
  let jackpotChance = 0.000000001;
  let elytraChance = 0.00001;

  jackpotChance *= multiplier;
  elytraChance *= multiplier;

  const roll = Math.random();

  if (roll < jackpotChance) {
    return { type: "jackpot" };
  }

  if (roll < elytraChance) {
    return {
      type: "elytra",
      cmd: `give ${player} elytra 1`
    };
  }

  return null;
}

// 🤖 Bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔌 RCON connect
const rcon = await Rcon.connect({
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT),
  password: process.env.RCON_PASSWORD
});

console.log("✅ Connected to Minecraft RCON");

client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");

  // 🔗 LINK
  if (args[0] === "!link") {
    const username = args[1];
    if (!username) return message.reply("Usage: !link <minecraft_username>");

    db.prepare(`
      INSERT INTO users (discord_id, mc_username)
      VALUES (?, ?)
      ON CONFLICT(discord_id)
      DO UPDATE SET mc_username = excluded.mc_username
    `).run(message.author.id, username);

    return message.reply(`✅ Linked to Minecraft account: ${username}`);
  }

  // 👤 GET USER
  let user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
    .get(message.author.id);

  if (!user) {
    db.prepare("INSERT INTO users (discord_id) VALUES (?)")
      .run(message.author.id);

    user = db.prepare("SELECT * FROM users WHERE discord_id = ?")
      .get(message.author.id);
  }

  const now = Date.now();
  const cooldown = config.cooldownSeconds * 1000;

  if (now - user.last_message < cooldown) return;

  const newCount = user.messages + 1;

  db.prepare(`
    UPDATE users
    SET messages = ?, last_message = ?
    WHERE discord_id = ?
  `).run(newCount, now, message.author.id);

  console.log(`${message.author.tag} -> ${newCount}`);

  // 🎁 REWARD TRIGGER
  if (newCount >= config.reward.messagesRequired && user.mc_username) {

    const multiplier = getLuckMultiplier(message.author.id, config);
    const special = rollSpecialRewards(user.mc_username, multiplier);

    try {

      // 💥 JACKPOT
      if (special?.type === "jackpot") {

        const player = user.mc_username;

        await rcon.send(`give ${player} iron_block 16`);
        await rcon.send(`give ${player} gold_block 8`);
        await rcon.send(`give ${player} netherite_block 1`);
        await rcon.send(`give ${player} diamond_block 2`);
        await rcon.send(`give ${player} beacon 1`);
        await rcon.send(`give ${player} breeze_rod 32`);

        await rcon.send(
          `give ${player} mace{Enchantments:[{id:"wind_burst",lvl:1}]} 1`
        );

        message.channel.send(
          `💥 JACKPOT!!! ${message.author} got MEGA LOOT + WIND BURST MACE!`
        );
      }

      // 🪽 ELYTRA
      else if (special?.type === "elytra") {
        await rcon.send(special.cmd);

        message.channel.send(
          `🪽 ${message.author} got an ELYTRA!`
        );
      }

      // 🎲 NORMAL REWARD
      else {
        const rewardCmd = getRandomReward(
          config.reward.pool,
          multiplier
        );

        const command = rewardCmd.replace(
          "{player}",
          user.mc_username
        );

        await rcon.send(command);

        message.reply(`🎁 Reward: ${command}`);
      }

      // 🔄 RESET
      db.prepare(`
        UPDATE users SET messages = 0 WHERE discord_id = ?
      `).run(message.author.id);

    } catch (err) {
      console.error(err);
      message.reply("❌ Reward error.");
    }
  }
});

client.login(process.env.TOKEN);