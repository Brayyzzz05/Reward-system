import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { setSetting } from "../core/settings.js";
import { logError } from "../utils/logger.js";

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
        .setDescription("First value")
    )
    .addStringOption(opt =>
      opt.setName("value2")
        .setDescription("Second value")
    ),

  async execute(interaction) {
    const action = interaction.options.getString("action");
    const v1 = interaction.options.getString("value1");
    const v2 = interaction.options.getString("value2");

    try {
      // =========================
      // SAFETY CHECK (IMPORTANT)
      // =========================
      if (!action) {
        return interaction.editReply("❌ Missing action");
      }

      // =========================
      // SET LUCK MULTIPLIER
      // =========================
      if (action === "setluck") {
        if (!v1) return interaction.editReply("❌ Missing value");

        await setSetting("luck_multiplier", v1);

        return interaction.editReply(`🎯 Luck set to **${v1}**`);
      }

      // =========================
      // SET MESSAGE
      // =========================
      if (action === "setmessage") {
        if (!v1) return interaction.editReply("❌ Missing message");

        await setSetting("roll_message", v1);

        return interaction.editReply("💬 Roll message updated");
      }

      // =========================
      // SET ROLL / RARITY
      // =========================
      if (action === "setroll" || action === "setrarity") {
        if (!v1 || !v2) {
          return interaction.editReply("❌ Missing tier or value");
        }

        await setSetting(`roll_${v1}`, v2);

        return interaction.editReply(`⭐ ${v1} set to **${v2}%**`);
      }

      return interaction.editReply("❌ Invalid action");

    } catch (err) {
      logError("ADMIN COMMAND", err);

      return interaction.editReply("❌ Admin command failed (check logs)");
    }
  }
};