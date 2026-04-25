export default {
  data: {
    name: "verify",
    description: "Link your Minecraft account",
    options: [
      {
        name: "username",
        type: 3, // STRING
        description: "Your Minecraft username",
        required: true
      }
    ]
  },

  async execute(interaction, { db }) {
    const username = interaction.options.getString("username");
    const discordId = interaction.user.id;

    try {
      // Create table if it doesn't exist
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          discord_id TEXT PRIMARY KEY,
          minecraft_username TEXT
        )
      `);

      // Insert or update user
      await db.query(
        `
        INSERT INTO users (discord_id, minecraft_username)
        VALUES ($1, $2)
        ON CONFLICT (discord_id)
        DO UPDATE SET minecraft_username = $2
        `,
        [discordId, username]
      );

      await interaction.reply({
        content: `✅ Successfully linked to Minecraft account: **${username}**`,
        ephemeral: true
      });

    } catch (err) {
      console.error("Verify error:", err);

      await interaction.reply({
        content: "❌ Failed to link account. Try again later.",
        ephemeral: true
      });
    }
  }
};