import { Client, GatewayIntentBits, Collection } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pkg from "pg";

import commandHandler from "./handlers/commandHandler.js";

dotenv.config();

const { Pool } = pkg;

// =====================
// DATABASE
// =====================
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
  console.warn("⚠️ Commands folder not found!");
} else {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = `./commands/${file}`;
    const command = await import(filePath);

    if (command.default?.data?.name) {
      client.commands.set(command.default.data.name, command.default);
      console.log(`✅ Loaded command: ${command.default.data.name}`);
    } else {
      console.warn(`⚠️ Skipped invalid command file: ${file}`);
    }
  }
}

// =====================
// EVENTS
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
    await command.execute(interaction, { client, db });
  } catch (err) {
    console.error(`❌ Error in command ${interaction.commandName}:`, err);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Something went wrong.",
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: "❌ Something went wrong.",
        ephemeral: true
      });
    }
  }
});

// =====================
// OPTIONAL: MESSAGE TRACKING
// =====================
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;

  // You can hook your reward system here later
});

// =====================
// START BOT
// =====================
client.login(process.env.DISCORD_TOKEN);

// =====================
// ERROR HANDLING
// =====================
process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});