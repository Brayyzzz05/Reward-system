import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link your Minecraft account to Discord")
    .addStringOption(option =>
      option
        .setName("username")
        .setDescription("Your Minecraft username")
        .setRequired(true)
    ),

  async execute(interaction, { db }) {
    const mcName = interaction.options.getString("username");

    try {
      // =====================
      // VALIDATION
      // =====================
      if (!mcName || mcName.length < 3) {
        return interaction.reply({
          content: "❌ Invalid Minecraft username.",
          ephemeral: true
        });
      }

      // =====================
      // CHECK IF ALREADY LINKED
      // =====================
      const existing = await db.query(
        "SELECT * FROM verifications WHERE discord_id = $1",
        [interaction.user.id]
      );

      if (existing.rows.length > 0) {
        return interaction.reply({
          content: `❌ You are already linked to **${existing.rows[0].minecraft_username}**`,
          ephemeral: true
        });
      }

      // =====================
      // INSERT LINK
      // =====================
      await db.query(
        "INSERT INTO verifications (discord_id, minecraft_username) VALUES ($1, $2)",
        [interaction.user.id, mcName]
      );

      return interaction.reply({
        content: `✅ Successfully linked to **${mcName}**`,
        ephemeral: true
      });

    } catch (err) {
      console.error("VERIFY ERROR:", err);

      return interaction.reply({
        content: "❌ Failed