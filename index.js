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
// SAFE ROLL SYSTEM
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
// GUARANTEE SYSTEM
// =====================
function applyGuarantee(user, cmd) {
  const tier = user.guaranteed_tier;
  const g = config.guaranteedRewards;

  if (!tier) return cmd;

  const map = {
    common: g.guaranteedCommonPlus,
    uncommon: g.guaranteedUncommonPlus,
    rare: g.guaranteedRarePlus,
    veryRare: g.guaranteedVeryRarePlus,
    mythic: g.guaranteedMythicPlus,
    ultra: g.guaranteedUltraPlus,
    jackpot: g.guaranteedJackpotPlus
  };

  const setting = map[tier];

  if (!setting?.enabled) return cmd;

  if (setting.discordId && setting.discordId !== user.discord_id) {
    return cmd;
  }

  return cmd;
}

// =====================
// COMMANDS (FIXED)
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
    .setName("setguarantee")
    .setDescription("Set guarantee tier")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target user")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("tier")
        .setDescription("Tier")
        .setRequired(true)
        .addChoices(
          { name: "none", value: "none" },
          { name: "common", value: "common" },
          { name: "uncommon", value: "uncommon" },
          { name: "rare", value: "rare" },
          { name: "veryRare", value: "veryRare" },
          { name: "mythic", value: "mythic" },
          { name: "ultra", value: "ultra" },
          { name: "jackpot", value: "jackpot" }
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

  console.log("🤖 Bot ready");
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

  // VERIFY
  if (i.commandName === "verify") {
    const name = i.options.getString("username");

    db.prepare("UPDATE users SET mc_username=? WHERE discord_id=?")
      .run(name, id);

    return i.reply("✅ linked");
  }

  // SET GUARANTEE
  if (i.commandName === "setguarantee") {
    if (!i.member.permissions.has("Administrator")) {
      return i.reply({ content: "❌ Admin only", ephemeral: true });
    }

    const target = i.options.getUser("user");
    const tier = i.options.getString("tier");

    db.prepare("UPDATE users SET guaranteed_tier=? WHERE discord_id=?")
      .run(tier === "none" ? null : tier, target.id);

    return i.reply(`✅ ${target.username} → ${tier}`);
  }

  // DAILY
  if (i.commandName === "daily") {
    db.prepare("UPDATE users SET spins=spins+2 WHERE discord_id=?").run(id);
    return i.reply("🎁 +2 spins");
  }

  // STATS
  if (i.commandName === "stats") {
    return i.reply(`🎟️ spins: ${user.spins || 0}\n🎯 guarantee: ${user.guaranteed_tier || "none"}`);
  }

  // ROLL
  if (i.commandName === "roll") {
    if ((user.spins || 0) <= 0) {
      return i.reply("❌ No spins");
    }

    await i.reply("🎰 spinning...");

    db.prepare("UPDATE users SET spins=spins-1 WHERE discord_id=?").run(id);

    const reward = getReward(config.reward.pool);
    let cmd = reward.replace("{player}", user.mc_username || "player");

    cmd = applyGuarantee(user, cmd);

    return i.editReply(`🎁 ${cmd}`);
  }
});

client.login(process.env.TOKEN);