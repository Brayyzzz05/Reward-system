import { SlashCommandBuilder } from "discord.js";
import db from "./database.js";
import config from "./config.js";
import { deliverReward } from "./rewardSystem.js";

// =====================
// ADMIN IDS (ADD YOURSELF HERE)
// =====================
const ADMINS = [
  "1274645481217327108"
];

// =====================
// COMMANDS REGISTER
// =====================
export const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Link Minecraft account"),
  new SlashCommandBuilder().setName("stats").setDescription("View your stats"),
  new SlashCommandBuilder().setName("roll").setDescription("Roll reward"),

  new SlashCommandBuilder().setName("shop").setDescription("View shop"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o =>
      o.setName("item").setDescription("spins/luck").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setDescription("amount").setRequired(true)),

  // ADMIN COMMANDS
  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Admin set spins")
    .addUserOption(o => o.setName("user").setDescription("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setluck")
    .setDescription("Admin set luck")
    .addUserOption(o => o.setName("user").setDescription("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Admin set messages")
    .addUserOption(o => o.setName("user").setDescription("user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("amount").setRequired(true))
];

// =====================
// USER FETCH
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

  return res.rows[0] || {};
}

// =====================
// ADMIN CHECK
// =====================
function isAdmin(id) {
  return ADMINS.includes(id);
}

// =====================
// HANDLER
// =====================
export async function handleInteraction(i) {
  if (!i.isChatInputCommand()) return;

  await i.deferReply({ ephemeral: true });

  const user = await getUser(i.user.id);

  // =====================
  // VERIFY
  // =====================
  if (i.commandName === "verify") {
    const mcName = i.user.username;

    await db.query(
      `INSERT INTO users (discord_id, minecraft_name)
       VALUES ($1,$2)
       ON CONFLICT (discord_id)
       DO UPDATE SET minecraft_name=$2`,
      [i.user.id, mcName]
    );

    return i.editReply("✅ Verified Minecraft account");
  }

  // =====================
  // STATS
  // =====================
  if (i.commandName === "stats") {
    return i.editReply(
      `📊 Stats:\nMessages: ${user.messages || 0}\nSpins: ${user.spins || 0}\nLuck: ${user.luck || 0}`
    );
  }

  // =====================
  // SHOP (TEXT ONLY)
  // =====================
  if (i.commandName === "shop") {
    return i.editReply(
      `🛒 SHOP:\n\n` +
      `🎰 /buy spins 5 → 80 coins\n` +
      `🍀 /buy luck 5 → 500 coins\n`
    );
  }

  // =====================
  // BUY SYSTEM
  // =====================
  if (i.commandName === "buy") {
    const item = i.options.getString("item");
    const amount = i.options.getInteger("amount");

    if (!["spins", "luck"].includes(item)) {
      return i.editReply("❌ Invalid item");
    }

    // simple pricing
    const cost = item === "spins" ? 80 : 500;

    await db.query(
      `UPDATE users SET ${item} = COALESCE(${item},0) + $1 WHERE discord_id=$2`,
      [amount, i.user.id]
    );

    return i.editReply(`✅ Bought ${amount} ${item}`);
  }

  // =====================
  // ROLL SYSTEM
  // =====================
  if (i.commandName === "roll") {
    const pool = config.reward.pool;

    let total = pool.reduce((a, b) => a + b.chance, 0);
    let r = Math.random() * total;

    let reward;

    for (const p of pool) {
      if (r < p.chance) {
        reward = p;
        break;
      }
      r -= p.chance;
    }

    if (!reward) {
      return i.editReply("❌ No reward found");
    }

    await deliverReward(i.user.id, user.minecraft_name, reward.cmd);

    return i.editReply("🎰 Rolled reward!");
  }

  // =====================
  // ADMIN: SET SPINS
  // =====================
  if (i.commandName === "setspins") {
    if (!isAdmin(i.user.id)) return i.editReply("❌ No permission");

    const target = i.options.getUser("user");
    const amt = i.options.getInteger("amount");

    await db.query(
      "UPDATE users SET spins=$1 WHERE discord_id=$2",
      [amt, target.id]
    );

    return i.editReply("✅ Spins updated");
  }

  // =====================
  // ADMIN: SET LUCK
  // =====================
  if (i.commandName === "setluck") {
    if (!isAdmin(i.user.id)) return i.editReply("❌ No permission");

    const target = i.options.getUser("user");
    const amt = i.options.getInteger("amount");

    await db.query(
      "UPDATE users SET luck=$1 WHERE discord_id=$2",
      [amt, target.id]
    );

    return i.editReply("✅ Luck updated");
  }

  // =====================
  // ADMIN: SET MESSAGES
  // =====================
  if (i.commandName === "setmessages") {
    if (!isAdmin(i.user.id)) return i.editReply("❌ No permission");

    const target = i.options.getUser("user");
    const amt = i.options.getInteger("amount");

    await db.query(
      "UPDATE users SET messages=$1 WHERE discord_id=$2",
      [amt, target.id]
    );

    return i.editReply("✅ Messages updated");
  }
}