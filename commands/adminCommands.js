import { setSetting } from "../core/settings.js";

export function registerAdminCommands(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.member.permissions.has("Administrator")) return;

    const args = msg.content.split(" ");
    const cmd = args[0];

    // =========================
    // SET LUCK MULTIPLIER
    // =========================
    if (cmd === "!setluck") {
      const value = args[1];
      await setSetting("luck_multiplier", value);

      return msg.reply(`🎯 Luck set to **${value}**`);
    }

    // =========================
    // SET ROLL MESSAGE
    // =========================
    if (cmd === "!setmessage") {
      const value = args.slice(1).join(" ");
      await setSetting("roll_message", value);

      return msg.reply(`💬 Roll message updated`);
    }

    // =========================
    // SET ROLL CHANCE (per tier)
    // =========================
    if (cmd === "!setroll") {
      const tier = args[1];
      const chance = args[2];

      await setSetting(`roll_${tier}`, chance);

      return msg.reply(`🎰 ${tier} chance set to **${chance}%**`);
    }

    // =========================
    // SET RARITY (alias)
    // =========================
    if (cmd === "!setrarity") {
      const tier = args[1];
      const chance = args[2];

      await setSetting(`roll_${tier}`, chance);

      return msg.reply(`⭐ Rarity ${tier} updated`);
    }
  });
}
