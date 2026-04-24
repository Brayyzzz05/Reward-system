import { rollReward } from "../systems/rollEngine.js";
import config from "../config.js";

// =====================
// REGISTER COMMANDS
// =====================
export function registerRewardCommands(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    const args = msg.content.trim().split(" ");
    const cmd = args[0].toLowerCase();

    // =====================
    // 🎰 ROLL COMMAND
    // =====================
    if (cmd === "!roll") {
      const mcName = args[1];

      if (!mcName) {
        return msg.reply("❌ Usage: !roll <minecraft name>");
      }

      try {
        const result = await rollReward(msg.author.id, mcName);

        return msg.reply(
          `🎰 You rolled: **${formatReward(result.cmd)}**`
        );
      } catch (err) {
        console.error("ROLL ERROR:", err);
        return msg.reply("⚠️ Roll failed. Try again later.");
      }
    }

    // =====================
    // 📊 VIEW CONFIG (DEBUG)
    // =====================
    if (cmd === "!rewards") {
      const list = config.reward.pool
        .slice(0, 10)
        .map(r => `• ${r.cmd} (${r.chance})`)
        .join("\n");

      return msg.reply(`🎁 Top rewards:\n${list}`);
    }

    // =====================
    // 🧪 TEST COMMAND
    // =====================
    if (cmd === "!testroll") {
      const test = await rollReward(msg.author.id, "TestPlayer");
      return msg.reply(`🧪 Test result: ${test.cmd}`);
    }
  });
}

// =====================
// FORMAT OUTPUT
// =====================
function formatReward(cmd) {
  if (cmd.includes("diamond")) return "💎 Diamond reward";
  if (cmd.includes("netherite")) return "🔥 Netherite reward";
  if (cmd.includes("elytra")) return "🪽 Elytra reward";
  if (cmd.includes("beacon")) return "🏆 Jackpot reward";
  return "🎁 Reward given";
}
