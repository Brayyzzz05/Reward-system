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
// ENV CHECK
// =====================
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
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
// LOAD COMMANDS (FIXED)
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
      const filePath = path.resolve(commandsPath, file);
      const commandModule = await import(`file://${filePath}`);

      const command = commandModule.default;

      if (!command?.data?.name || !command?.execute) {
        console.warn(`⚠️ Invalid command skipped: ${file}`);
        continue;
      }

      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);

    } catch (err) {
      console.error(`❌ Failed to load ${file}:`, err);
    }
  }

  console.log("📦 Commands loaded:", [...client.commands.keys()]);
}

// =====================
// READY EVENT
// =====================
client.once("clientReady", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// INTERACTION HANDLER (FIXED)
// =====================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.log("❌ Command not found:", interaction.commandName);

    return interaction.reply({
      content: "❌ Command not found",
      ephemeral: true
    });
  }

  try {
    await command.execute(interaction, { client, db });
  } catch (err) {
    console.error(`❌ Error in ${interaction.commandName}:`, err);

    const msg = {
      content: "❌ Something went wrong.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

// =====================
// OPTIONAL MESSAGE EVENT
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
// LOGIN
// =====================
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Login failed:", err);
  process.exit(1);
});