import { SlashCommandBuilder } from "discord.js";
import { buyItem } from "../systems/shopSystem.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Shop system")
    .addSubcommand(s =>
      s.setName("buy")
        .addStringOption(o =>
          o.setName("item")
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("amount")
            .setRequired(false)
        )
    )
    .addSubcommand(s =>
      s.setName("list")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      return interaction.editReply(
        `🛒 SHOP:\n
🎰 spin = 20 messages
🎰 5spins = 80 messages
🍀 +1 luck = 100 messages
🍀 +5 luck = 400 messages`
      );
    }

    const item = interaction.options.getString("item");
    const amount = interaction.options.getInteger("amount") || 1;

    const res = await buyItem(interaction.user.id, item, amount);

    return interaction.editReply(res);
  }
};