import "dotenv/config";
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";

import { commands, handleInteraction } from "./commands.js";
import { startRewardWorker } from "./rewardSystem.js";

// =====================
// CLIENT
// =====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

console.log("🚀 Booting bot...");

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// =====================
// REGISTER COMMANDS
// =====================
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands.map(c => c.toJSON()) }
  );

  console.log("✅ Commands registered");
}

// =====================
// READY
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  await registerCommands();

  startRewardWorker();

  console.log("⚡ Bot fully online");
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (err) {
    console.error(err);

    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: "❌ Error occurred",
        ephemeral: true
      });
    }
  }
});

// =====================
client.login(process.env.TOKEN);