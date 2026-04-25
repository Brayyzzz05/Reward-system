import { Client, GatewayIntentBits, Collection } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pkg from "pg";
import { logError, logInfo } from "./utils/logger.js";

dotenv.config();

const { Pool } = pkg;

console.log("🚀 Starting bot...");

// =====================
// ENV CHECK
// =====================
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN");
  process.exit(1);
}

// =====================
// DATABASE
// =====================
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : undefined
});

db.on("error", (err) => {
  logError("DATABASE ERROR", err);
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
// LOAD COMMANDS
// =====================
const commandsPath = path.join(process.cwd(), "commands");

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    try {
      const filePath = path.resolve(commandsPath, file);
      const commandModule = await import(`file://${filePath}`);

      const command = commandModule.default;

      if (!command?.data?.name || !command?.execute) {
        logInfo(`Skipped invalid command: ${file}`);
        continue;
      }

      client.commands.set(command.data.name, command);
      logInfo(`Loaded command: ${command.data.name}`);

    } catch (err) {
      logError(`COMMAND LOAD: ${file}`, err);
    }
  }
}

console.log("📦 Commands loaded:", [...client.commands.keys()]);

// =====================
// READY EVENT
// =====================
client.once("clientReady", () => {
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
    // =====================
    // SAFE DEFER (PREVENT TIMEOUT)
    // =====================
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    await command.execute(interaction, { client, db });

  } catch (err) {
    logError(`COMMAND: ${interaction.commandName}`, err);

    try {
      if (interaction.deferred) {
        await interaction.editReply("❌ Command failed (check logs)");
      } else {
        await interaction.reply({
          content: "❌ Command failed",
          ephemeral: true
        });
      }
    } catch (e) {
      logError("ERROR RESPONSE FAILED", e);
    }
  }
});

// =====================
// MESSAGE TRACKING (ECONOMY SYSTEM)
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
    logError("MESSAGE TRACKING", err);
  }
});

// =====================
// GLOBAL ERROR HANDLING
// =====================
process.on("unhandledRejection", (err) => {
  logError("UNHANDLED REJECTION", err);
});

process.on("uncaughtException", (err) => {
  logError("UNCAUGHT EXCEPTION", err);
});

// =====================
// LOGIN
// =====================
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log("🟢 Bot logged in"))
  .catch((err) => {
    logError("LOGIN FAILED", err);
    process.exit(1);
  });