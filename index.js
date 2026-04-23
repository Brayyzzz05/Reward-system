import 'dotenv/config';
import { Client, GatewayIntentBits } from "discord.js";
import db from "./database.js";
import config from "./config.js";
import { Rcon } from "rcon-client";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔌 Connect RCON
const rcon = await Rcon.connect({
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT),
  password: process.env.RCON_PASSWORD
});

console.log("✅ Connected to Minecraft RCON");

// 🎲 Weighted reward picker
function getRandomReward(pool) {
  const totalWeight = pool.reduce((sum, item) => sum + item.chance, 0);
  let random = Math.random() * totalWeight;

  for (const item of pool) {
    if (random < item.chance) return item.cmd;
    random -= item.chance;
  }
}

// 🎰 Special rolls (ELYTRA + JACKPOT)
function rollSpecialRewards(player) {
  const roll = Math.random();

  // 💥 JACKPOT (0.0000001%)
  if (roll < 0.000000001) {
    return { type: "jackpot" };
  }

  // 🪽 ELYTRA (0.001%)
  if (roll < 0.00001) {
    return {
      type: "elytra",
      cmd: `give ${player} elytra 1`
    };
  }

  return null;
}

client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");

  // 🔗 LINK COMMAND
  if (args[0] === "!link") {
    const username = args[1];

    if (!username) {
      return message.reply("Usage: !link <minecraft_username>");
    }

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

  // ⏱️ Cooldown check
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

    const special = rollSpecialRewards(user.mc_username);

    try {

      // 💥 JACKPOT
      if (special && special.type === "jackpot") {
        for (const item of config.reward.pool) {
          const cmd = item.cmd.replace("{player}", user.mc_username);
          await rcon.send(cmd);
        }

        message.channel.send(
          `💥💥 JACKPOT!!! ${message.author} received ALL rewards!!!`
        );
      }

      // 🪽 ELYTRA
      else if (special && special.type === "elytra") {
        await rcon.send(special.cmd);

        message.channel.send(
          `🪽🔥 ${message.author} JUST WON AN ELYTRA (0.001%)!!!`
        );
      }

      // 🎲 NORMAL REWARD
      else {
        const rewardCmd = getRandomReward(config.reward.pool);
        const command = rewardCmd.replace("{player}", user.mc_username);

        await rcon.send(command);

        message.reply(`🎉 You received: ${command}`);
      }

      // 🔄 Reset counter
      db.prepare(`
        UPDATE users SET messages = 0 WHERE discord_id = ?
      `).run(message.author.id);

    } catch (err) {
      console.error(err);
      message.reply("❌ Error giving reward.");
    }
  }
});

client.login(process.env.TOKEN);