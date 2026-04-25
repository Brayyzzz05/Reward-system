import { SlashCommandBuilder } from "discord.js";
import { rollReward } from "../systems/rollEngine.js";
import config from "../config.js";

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a reward")
    .addStringOption(option =>
      option
        .setName("minecraft")
        .setDescription("Your Minecraft username")
        .setRequired(true)
    ),

  async execute(interaction) {
    const mcName = interaction.options.getString("minecraft");

    try {
      const result = await rollReward(interaction.user.id, mcName);

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
// FORMAT OUTPUT
// =====================
function formatReward(cmd) {
  if (cmd.includes("diamond")) return "💎 Diamond reward";
  if (cmd.includes("netherite")) return "🔥 Netherite reward";
  if (cmd.includes("elytra")) return "🪽 Elytra reward";
  if (cmd.includes("beacon")) return "🏆 Jackpot reward";
  return "🎁 Reward given";
}