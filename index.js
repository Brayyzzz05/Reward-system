import { Client, GatewayIntentBits } from "discord.js";
import { connectRcon } from "./rconHandler.js";
import { startRewardWorker } from "./rewardSystem.js";
import { handleInteraction } from "./commands.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =====================
// BOT READY
// =====================
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // start reward system worker
  startRewardWorker();

  // connect RCON (NON-BLOCKING)
  connectRcon();

  console.log("⚡ System online");
});

// =====================
// COMMAND HANDLER
// =====================
client.on("interactionCreate", handleInteraction);

// =====================
// LOGIN
// =====================
client.login(process.env.TOKEN);
