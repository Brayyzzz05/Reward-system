import { SlashCommandBuilder } from "discord.js";
import { buyItem } from "../systems/shopSystem.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Buy or view shop items")
    .addSubcommand(sub =>
      sub
        .setName("buy")
        .setDescription("Buy an item")
        .addStringOption(opt =>
          opt.setName("item")
            .setDescription("Item name")
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName("amount")
            .setDescription("Quantity")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("View shop items")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      // =====================
      // LIST ITEMS
      // =====================
      if (sub === "list") {
        return interaction.reply("🛒 diamond (100), netherite (500), elytra (2000)");
      }

      // =====================
      // BUY ITEM
      // =====================
      if (sub === "buy") {
        const item = interaction.options.getString("item");
        const amount = interaction.options.getInteger("amount");

        const res = await buyItem(interaction.user.id, item, amount);

        return interaction.reply(res);
      }

    } catch (err) {
      console.error("SHOP ERROR:", err);

      return interaction.reply({
        content: "❌ Shop failed",
        ephemeral: true
      });
    }
  }
};