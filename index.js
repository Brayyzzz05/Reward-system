import { Client, GatewayIntentBits, Collection } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pkg from "pg";

import commandHandler from "./handlers/commandHandler.js";

dotenv.config();

const { Pool } = pkg;

// =====================
// STARTUP LOG
// =====================
console.log("🚀 Starting bot...");

// =====================
// ENV SAFETY CHECKS
// =====================
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is missing! Database features may fail.");
}

// =====================
// DATABASE (SAFE INIT)
// =====================
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : undefined
});

// Catch DB errors so they don’t crash bot silently
db.on("error", (err) => {
  console.error("❌ Unexpected database error:", err);
});

// =====================
// DISCORD CLIENT
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
    // Add more later if needed:
    // GatewayIntentBits.GuildMessages,
    // GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// =====================
// LOAD COMMANDS (SAFE VERSION)
// =====================
const commandsPath = path.join(process.cwd(), "commands");

if (!fs.existsSync(commandsPath)) {
  console.warn("⚠️ Commands folder not found!");
} else {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    try {
      const filePath = `./commands/${file}`;
      const command = await import(filePath);

      if (command.default?.data?.name) {
        client.commands.set(command.default.data.name, command.default);
        console.log(`✅ Loaded command: ${command.default.data.name}`);
      } else {
        console.warn(`⚠️ Invalid command file skipped: ${file}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load command ${file}:`, err);
    }
  }
}

// =====================
// EVENTS
// =====================

// FIXED: proper Discord.js event name
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
    await command.execute(interaction, { client, db });
  } catch (err) {
    console.error(`❌ Error in command ${interaction.commandName}:`, err);

    const reply = {
      content: "❌ Something went wrong.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// =====================
// MESSAGE CREATE (SAFE)
// =====================
client.on("messageCreate", (msg) => {
  try {
    if (msg.author.bot) return;

    // future reward system hook
  } catch (err) {
    console.error("❌ messageCreate error:", err);
  }
});

// =====================
// GLOBAL ERROR HANDLING
// =====================
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled promise rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception:", err);
});

// =====================
// START BOT (SAFE LOGIN)
// =====================
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Failed to login bot:", err);
  process.exit(1);
});