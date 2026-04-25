import { SlashCommandBuilder } from "discord.js";
import { getStats } from "../systems/shopSystem.js";

export default {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Check your stats"),

  async execute(interaction) {
    const s = await getStats(interaction.user.id);

    if (!s) {
      return interaction.editReply("❌ No stats found");
    }

    return interaction.editReply(
      `📊 YOUR STATS\n
💬 Messages: ${s.messages}
🎰 Spins: ${s.spins}
🍀 Luck: ${s.luck}`
    );
  }
};