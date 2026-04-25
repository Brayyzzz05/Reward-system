import { Client, GatewayIntentBits, Collection } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

// =====================
// START LOG
// =====================
console.log("🚀 Starting bot...");

// =====================
// ENV CHECKS
// =====================
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is missing (DB disabled)");
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
  console.error("❌ Database error:", err);
});

// =====================
// DISCORD CLIENT
// =====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// =====================
// LOAD COMMANDS
// =====================
const commandsPath = path.join(process.cwd(), "commands");

if (!fs.existsSync(commandsPath)) {
  console.warn("⚠️ No commands folder found!");
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
        console.log(`✅ Loaded: ${command.default.data.name}`);
      } else {
        console.warn(`⚠️ Skipped invalid command: ${file}`);
      }
    } catch (err) {
      console.error(`❌ Failed loading ${file}:`, err);
    }
  }
}

// =====================
// READY EVENT
// =====================
client.once("clientReady", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// SLASH COMMAND HANDLER
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
    console.error(`❌ Command error (${interaction.commandName}):`, err);

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
// MESSAGE EVENT (OPTIONAL)
// =====================
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
});

// =====================
// GLOBAL ERROR HANDLING
// =====================
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception:", err);
});

// =====================
// LOGIN BOT
// =====================
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Login failed:", err);
  process.exit(1);
});