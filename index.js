import { Client, GatewayIntentBits, Collection } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pkg from "pg";

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
  console.error("🔥 DB ERROR:", err);
});

// =====================
// CLIENT
// =====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// =====================
// LOAD COMMANDS (SAFE)
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
        console.log(`⚠️ Skipped invalid command: ${file}`);
        continue;
      }

      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);

    } catch (err) {
      console.error(`❌ Failed loading ${file}:`, err);
    }
  }
} else {
  console.warn("⚠️ Commands folder not found");
}

console.log("📦 Commands loaded:", [...client.commands.keys()]);

// =====================
// READY EVENT
// =====================
client.once("clientReady", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// INTERACTION HANDLER (FIXED CORE)
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
    // FIX: PREVENT TIMEOUTS
    // =====================
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    await command.execute(interaction, { client, db });

  } catch (err) {
    console.error(`🔥 COMMAND ERROR (${interaction.commandName}):`, err);

    try {
      if (interaction.deferred) {
        await interaction.editReply("❌ Command failed. Check bot logs.");
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
// OPTIONAL MESSAGE EVENT
// =====================
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
});

// =====================
// GLOBAL ERROR HANDLING
// =====================
process.on("unhandledRejection", (err) => {
  console.error("🔥 UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

// =====================
// LOGIN
// =====================
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log("🟢 Bot logged in"))
  .catch(err => {
    console.error("❌ Login failed:", err);
  });