import { Client, GatewayIntentBits, Collection } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

console.log("🚀 Starting bot...");

// =====================
// ENV SAFETY CHECK
// =====================
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN");
  process.exit(1);
}

// =====================
// DATABASE (SAFE INIT)
// =====================
export const db = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Prevent DB crash killing bot
db.on("error", (err) => {
  console.error("🔥 DATABASE ERROR:", err);
});

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

client.commands = new Collection();

// =====================
// SAFE COMMAND LOADER
// =====================
const commandsPath = path.join(process.cwd(), "commands");

async function loadCommands() {
  if (!fs.existsSync(commandsPath)) {
    console.log("⚠️ No commands folder found");
    return;
  }

  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

  for (const file of files) {
    try {
      const filePath = path.resolve(commandsPath, file);
      const mod = await import(`file://${filePath}`);

      const cmd = mod.default;

      if (!cmd?.data?.name || !cmd?.execute) {
        console.log(`⚠️ Skipped invalid command: ${file}`);
        continue;
      }

      client.commands.set(cmd.data.name, cmd);
      console.log(`✅ Loaded command: ${cmd.data.name}`);

    } catch (err) {
      console.log(`❌ Failed command: ${file}`);
      console.error(err);
    }
  }

  console.log("📦 Commands loaded:", [...client.commands.keys()]);
}

// =====================
// READY EVENT (FIXED)
// =====================
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// INTERACTION HANDLER
// =====================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    return interaction.reply({
      content: "❌ Command not found",
      ephemeral: true
    });
  }

  try {
    // ALWAYS defer safely
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    await command.execute(interaction, { client, db });

  } catch (err) {
    console.error(`❌ COMMAND ERROR (${interaction.commandName})`, err);

    try {
      if (interaction.deferred) {
        await interaction.editReply("❌ Command failed. Check logs.");
      } else {
        await interaction.reply({
          content: "❌ Command failed.",
          ephemeral: true
        });
      }
    } catch (e) {
      console.error("❌ Failed to send error reply:", e);
    }
  }
});

// =====================
// MESSAGE TRACKING (SAFE)
// =====================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  try {
    await db.query(
      `INSERT INTO user_stats (discord_id, messages)
       VALUES ($1, 1)
       ON CONFLICT (discord_id)
       DO UPDATE SET messages = user_stats.messages + 1`,
      [msg.author.id]
    );
  } catch (err) {
    console.error("⚠️ Message tracking error:", err);
  }
});

// =====================
// GLOBAL ERROR SAFETY
// =====================
process.on("unhandledRejection", (err) => {
  console.error("🔥 UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err);
});

// =====================
// START BOT SAFELY
// =====================
(async () => {
  try {
    await loadCommands();

    await client.login(process.env.DISCORD_TOKEN);

    console.log("🟢 Bot fully online");

  } catch (err) {
    console.error("❌ FAILED TO START BOT:", err);
    process.exit(1);
  }
})();