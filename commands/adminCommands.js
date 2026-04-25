import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { setSetting } from "../core/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin control panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName("action")
        .setDescription("What to change")
        .setRequired(true)
        .addChoices(
          { name: "setluck", value: "setluck" },
          { name: "setmessage", value: "setmessage" },
          { name: "setroll", value: "setroll" },
          { name: "setrarity", value: "setrarity" }
        )
    )
    .addStringOption(opt =>
      opt.setName("value1")
        .setDescription("First value (luck/tier)")
    )
    .addStringOption(opt =>
      opt.setName("value2")
        .setDescription("Second value (chance/message)")
    ),

  async execute(interaction) {
    const action = interaction.options.getString("action");
    const v1 = interaction.options.getString("value1");
    const v2 = interaction.options.getString("value2");

    try {
      // =========================
      // SET LUCK MULTIPLIER
      // =========================
      if (action === "setluck") {
        await setSetting("luck_multiplier", v1);

        return interaction.reply(`🎯 Luck set to **${v1}**`);
      }

      // =========================
      // SET MESSAGE
      // =========================
      if (action === "setmessage") {
        await setSetting("roll_message", v1);

        return interaction.reply("💬 Roll message updated");
      }

      // =========================
      // SET ROLL / RARITY
      // =========================
      if (action === "setroll" || action === "setrarity") {
        await setSetting(`roll_${v1}`, v2);

        return interaction.reply(`⭐ ${v1} set to **${v2}%**`);
      }

      return interaction.reply("❌ Invalid action");

    } catch (err) {
      console.error("ADMIN ERROR:", err);

      return interaction.reply({
        content: "❌ Admin command failed",
        ephemeral: true
      });
    }
  }
};