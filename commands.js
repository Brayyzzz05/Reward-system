import { SlashCommandBuilder } from "discord.js";
import db from "./database.js";
import config from "./config.js";
import { giveReward } from "./rewardSystem.js";

// =====================
// COMMAND DEFINITIONS
// =====================
export const commands = [
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your stats"),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link your Minecraft account")
    .addStringOption(opt =>
      opt.setName("username").setDescription("Minecraft username").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a reward"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View shop"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item").setDescription("spin/luck").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("amount").setRequired(true)
    )
];

// =====================
// SAFE USER FETCH
// =====================
async function getUser(id) {
  await db.query(
    "INSERT INTO users (discord_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [id]
  );

  const res = await db.query(
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
// INTERACTION HANDLER
// =====================
export async function handleInteraction(i) {
  if (!i.isChatInputCommand()) return;

  try {
    await i.deferReply({ ephemeral: true });

    const user = await getUser(i.user.id);

    // =====================
    // STATS
    // =====================
    if (i.commandName === "stats") {
      return i.editReply(
`💬 Messages: ${user.messages}
🎟 Spins: ${user.spins}
🍀 Luck: ${user.luck_multi}`
      );
    }

    // =====================
    // VERIFY
    // =====================
    if (i.commandName === "verify") {
      const mc = i.options.getString("username");

      await db.query(
        `INSERT INTO users (discord_id, minecraft_name)
         VALUES ($1,$2)
         ON CONFLICT (discord_id)
         DO UPDATE SET minecraft_name=$2`,
        [i.user.id, mc]
      );

      return i.editReply("✅ Successfully linked account");
    }

    // =====================
    // ROLL (IMPORTANT FIXED)
    // =====================
    if (i.commandName === "roll") {
      if (!user.minecraft_name) {
        return i.editReply("❌ You must verify first");
      }

      const pool = config.reward.pool;

      let total = pool.reduce((a,b)=>a+b.chance,0);
      let r = Math.random() * total;

      let reward = null;

      for (const p of pool) {
        if (r < p.chance) {
          reward = p;
          break;
        }
        r -= p.chance;
      }

      if (!reward) {
        return i.editReply("❌ No reward selected");
      }

      await giveReward(i.user.id, user.minecraft_name, reward.cmd);

      return i.editReply("🎰 Rolling reward...");
    }

    // =====================
    // SHOP (BASIC VERSION)
    // =====================
    if (i.commandName === "shop") {
      return i.editReply(
`🛒 SHOP

Spin x1 = 20 msgs
Spin x5 = 80 msgs

Luck x1 = 100 msgs
Luck x5 = 500 msgs`
      );
    }

    // =====================
    // BUY SYSTEM
    // =====================
    if (i.commandName === "buy") {
      const item = i.options.getString("item");
      const amount = i.options.getInteger("amount");

      let cost = 0;

      if (item === "spin") cost = 20 * amount;
      if (item === "luck") cost = 100 * amount;

      if (!cost) return i.editReply("❌ invalid item");

      if ((user.messages || 0) < cost) {
        return i.editReply("❌ not enough messages");
      }

      await db.query(
        `UPDATE users
         SET messages = messages - $1,
             spins = CASE WHEN $2='spin' THEN spins + $3 ELSE spins END,
             luck_multi = CASE WHEN $2='luck' THEN luck_multi + $3 ELSE luck_multi END
         WHERE discord_id=$4`,
        [cost, item, amount, i.user.id]
      );

      return i.editReply(`✅ Purchased ${amount} ${item}`);
    }

  } catch (e) {
    console.error("COMMAND ERROR:", e);

    if (!i.replied) {
      return i.reply({
        content: "❌ command error",
        ephemeral: true
      });
    }
  }
}