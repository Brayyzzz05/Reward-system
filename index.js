import { Client, GatewayIntentBits } from "discord.js";
import { loadCommands } from "./handlers/commandHandler.js";
import dotenv from "dotenv";

dotenv.config();

// =====================
// DISCORD CLIENT
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================
// READY EVENT
// =====================
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// LOAD COMMAND SYSTEM
// =====================
loadCommands(client);

// =====================
// LOGIN
// =====================
client.login(process.env.TOKEN);
