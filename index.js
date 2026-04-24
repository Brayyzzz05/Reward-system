import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} from "discord.js";

import { commands, handleInteraction } from "./commands.js";
import { startRewardWorker } from "./rewardSystem.js";
import { connectRcon } from "./rconHandler.js";
import "./adminPanel.js";

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
// SAFETY NET (CRASH PREVENTION)
// =====================
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

// =====================
// REGISTER SLASH COMMANDS
// =====================
async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commands.map(cmd => cmd.toJSON())
      }
    );

    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error("❌ Command registration failed:", err);
  }
}

// =====================
// READY EVENT
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // 1. Connect RCON FIRST (safe startup)
  try {
    await connectRcon();
  } catch (err) {
    console.error("⚠️ RCON failed to connect:", err.message);
  }

  // 2. Register commands
  await registerCommands();

  // 3. Start reward worker (background system)
  startRewardWorker();

  console.log("⚡ Bot fully online");
});

// =====================
// INTERACTION HANDLER
// =====================
client.on("interactionCreate", async (interaction) => {
  try {
    // ALWAYS defer safely first (prevents "not responding")
    if (interaction.isChatInputCommand()) {
      await interaction.deferReply({ ephemeral: true });
    }

    await handleInteraction(interaction);

  } catch (err) {
    console.error("❌ Interaction error:", err);

    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: "❌ Something went wrong",
        ephemeral: true
      });
    }
  }
});

// =====================
// LOGIN
// =====================
client.login(process.env.TOKEN);