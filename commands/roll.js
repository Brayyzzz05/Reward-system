import { rollReward } from "../systems/rollEngine.js";
import { getMCName } from "../systems/verifySystem.js";

export default {
  name: "!roll",

  async execute(msg, args) {
    try {
      // =====================
      // GET VERIFIED MC NAME
      // =====================
      const mcName = await getMCName(msg.author.id);

      if (!mcName) {
        return msg.reply("❌ You are not verified. Use: !verify <minecraft name>");
      }

      // =====================
      // RUN ROLL
      // =====================
      const result = await rollReward(msg.author.id, mcName);

      // =====================
      // RESPONSE
      // =====================
      return msg.reply(`🎰 You rolled: **${formatReward(result.cmd)}**`);

    } catch (err) {
      console.error("ROLL ERROR:", err);
      return msg.reply("⚠️ Roll failed. Try again later.");
    }
  }
};

// =====================
// SIMPLE FORMATTER
// =====================
function formatReward(cmd) {
  if (cmd.includes("netherite")) return "🔥 Mythic Reward";
  if (cmd.includes("diamond")) return "💎 Rare Reward";
  if (cmd.includes("elytra")) return "🪽 Ultra Rare Reward";
  if (cmd.includes("beacon")) return "🏆 JACKPOT";
  return "🎁 Reward";
}
