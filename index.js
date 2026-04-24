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
// SAFE RCON
// =====================
function safeSend(cmd) {
  try {
    if (!rcon) return;
    rcon.send(cmd).catch(() => {});
  } catch {}
}

// =====================
// REWARD SYSTEM
// =====================
function getReward(pool) {
  const total = pool.reduce((a, b) => a + b.chance, 0);
  let r = Math.random() * total;

  for (const item of pool) {
    if (r < item.chance) return item.cmd;
    r -= item.chance;
  }
}

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

  if (member?.permissions?.has("Administrator") && dbUser?.luck_mode === 1) {
    mult *= config.reward.adminLuckMultiplier;
  }

  return mult;
}

// =====================
// SLASH COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link your Minecraft account")
    .addStringOption(opt =>
      opt.setName("username")
        .setDescription("Minecraft username")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll rewards"),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Get spins"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View stats"),

  new SlashCommandBuilder()
    .setName("givespins")
    .setDescription("Admin: give spins")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("Amount")
        .setRequired(true)
    ),

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
// REGISTER COMMANDS
// =====================
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("🤖 Bot online (stable MC verify build)");
});

// =====================
// SAFE INTERACTION WRAPPER
// =====================
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  try {
    const id = i.user.id;

    let user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);

    if (!user) {
      db.prepare("INSERT INTO users (discord_id) VALUES (?)").run(id);
      user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);
    }

    // ================= VERIFY =================
    if (i.commandName === "verify") {
      const mc = i.options.getString("username");

      db.prepare(`
        UPDATE users SET mc_username=? WHERE discord_id=?
      `).run(mc, id);

      return i.reply({
        content: `✅ Verified as **${mc}**`,
        ephemeral: true
      });
    }

    // ================= GIVE SPINS (ADMIN) =================
    if (i.commandName === "givespins") {
      if (!i.member.permissions.has("Administrator")) {
        return i.reply({ content: "❌ Admin only", ephemeral: true });
      }

      const target = i.options.getUser("user");
      const amount = i.options.getInteger("amount");

      db.prepare(`
        UPDATE users SET spins = spins + ? WHERE discord_id=?
      `).run(amount, target.id);

      return i.reply(`🎟️ Gave ${amount} spins to ${target.username}`);
    }

    // ================= LUCK MODE =================
    if (i.commandName === "luckmode") {
      if (!i.member.permissions.has("Administrator")) {
        return i.reply({ content: "❌ Admin only", ephemeral: true });
      }

      const state = i.options.getString("state");
      const val = state === "on" ? 1 : 0;

      db.prepare(`
        UPDATE users SET luck_mode=? WHERE discord_id=?
      `).run(val, id);

      return i.reply(val ? "🍀 Luck ON" : "🍀 Luck OFF");
    }

    // ================= DAILY =================
    if (i.commandName === "daily") {
      db.prepare(`
        UPDATE users SET spins = spins + 2 WHERE discord_id=?
      `).run(id);

      return i.reply("🎁 +2 spins");
    }

    // ================= STATS =================
    if (i.commandName === "stats") {
      return i.reply(
        `🎟️ Spins: ${user.spins || 0}\n🎮 MC: ${user.mc_username || "Not linked"}`
      );
    }

    // ================= ROLL =================
    if (i.commandName === "roll") {

      if ((user.spins || 0) <= 0) {
        return i.reply("❌ No spins");
      }

      await i.reply("🎰 spinning...");

      setTimeout(() => {

        db.prepare(`
          UPDATE users SET spins = spins - 1 WHERE discord_id=?
        `).run(id);

        const luck = getLuck(user, i.member);
        const roll = Math.random() / luck;

        let reward;

        if (
          config.reward.guaranteedUltra.enabled &&
          id === config.reward.guaranteedUltra.discordId
        ) {
          reward = "give {player} netherite_ingot 1";
        } else {
          reward =
            roll < 0.00001
              ? "give {player} elytra 1"
              : getReward(config.reward.pool);
        }

        const cmd = reward.replace("{player}", user.mc_username || "player");

        safeSend(cmd);

        i.editReply(`🎁 ${cmd}`).catch(() => {});
      }, 0);
    }

  } catch (err) {
    console.error("COMMAND ERROR:", err);

    if (i.replied || i.deferred) {
      i.followUp("❌ Something broke").catch(() => {});
    } else {
      i.reply("❌ Something broke").catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);