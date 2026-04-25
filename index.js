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
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

db.on("error", (err) => {
  console.error("🔥 DB ERROR:", err);
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
// LOAD COMMANDS (SAFE)
// =====================
const commandsPath = path.join(process.cwd(), "commands");

const loadCommands = async () => {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
  const loaded = new Set();

  for (const file of files) {
    try {
      const filePath = path.resolve(commandsPath, file);
      const mod = await import(`file://${filePath}`);
      const cmd = mod.default;

      if (!cmd?.data?.name || !cmd?.execute) continue;

      if (loaded.has(cmd.data.name)) continue;

      loaded.add(cmd.data.name);
      client.commands.set(cmd.data.name, cmd);

      console.log(`✅ Loaded: ${cmd.data.name}`);

    } catch (err) {
      console.error(`❌ Failed: ${file}`, err);
    }
  }
};

// =====================
// READY
// =====================
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);

  if (!cmd) {
    return interaction.reply({ content: "❌ Not found", ephemeral: true });
  }

  try {
    await interaction.deferReply();
    await cmd.execute(interaction, { db });

  } catch (err) {
    console.error("COMMAND ERROR:", err);
    await interaction.editReply("❌ Command failed");
  }
});

// =====================
// MESSAGE TRACKING (ECONOMY)
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
    console.error("MSG TRACK ERROR:", err);
  }
});

// =====================
// START
// =====================
(async () => {
  try {
    await loadCommands();
    await client.login(process.env.DISCORD_TOKEN);
    console.log("🟢 Bot online");
  } catch (err) {
    console.error("START ERROR:", err);
  }
})();