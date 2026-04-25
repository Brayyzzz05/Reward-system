import { SlashCommandBuilder } from "discord.js";
import { rollReward } from "../systems/rollEngine.js";
import { getMCName } from "../systems/verifySystem.js";
import { logError } from "../utils/logger.js";

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll Minecraft rewards"),

  async execute(interaction) {
    try {
      const mcName = await getMCName(interaction.user.id);

      if (!mcName) {
        return interaction.editReply("❌ Not verified");
      }

      const result = await rollReward(interaction.user.id, mcName);

      return interaction.editReply(`🎰 ${result.cmd}`);

    } catch (err) {
      logError("ROLL COMMAND", err);
      return interaction.editReply("❌ Roll failed");
    }
  }
};