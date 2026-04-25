import { SlashCommandBuilder } from "discord.js";
import { rollReward } from "../systems/rollEngine.js";
import { getMCName } from "../systems/verifySystem.js";

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll your reward"),

  async execute(interaction) {
    try {
      const userId = interaction.user.id;

      // =====================
      // GET VERIFIED MC NAME
      // =====================
      const mcName = await getMCName(userId);

      if (!mcName) {
        return interaction.reply({
          content: "❌ You are not verified. Use /verify <minecraft name>",
          ephemeral: true
        });
      }

      // =====================
      // RUN ROLL
      // =====================
      const result = await rollReward(userId, mcName);

      // =====================
      // RESPONSE
      // =====================
      return interaction.reply(
        `🎰 You rolled: **${formatReward(result.cmd)}**`
      );

    } catch (err) {
      console.error("ROLL ERROR:", err);

      return interaction.reply({
        content: "⚠️ Roll failed. Try again later.",
        ephemeral: true
      });
    }
  }
};

// =====================
// FORMATTER
// =====================
function formatReward(cmd) {
  if (cmd.includes("netherite")) return "🔥 Mythic Reward";
  if (cmd.includes("diamond")) return "💎 Rare Reward";
  if (cmd.includes("elytra")) return "🪽 Ultra Rare Reward";
  if (cmd.includes("beacon")) return "🏆 JACKPOT";
  return "🎁 Reward";
}