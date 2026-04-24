import fs from "fs";
import path from "path";

const commands = new Map();

// =====================
// LOAD COMMAND FILES
// =====================
export function loadCommands(client) {
  const commandFolders = fs.readdirSync("./commands");

  for (const file of commandFolders) {
    if (!file.endsWith(".js")) continue;

    const command = import(`../commands/${file}`);

    command.then((cmd) => {
      if (cmd.default) {
        commands.set(cmd.default.name, cmd.default);
      }
    });
  }

  // =====================
  // MESSAGE LISTENER
  // =====================
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    const args = msg.content.trim().split(/ +/);
    const name = args.shift().toLowerCase();

    const command =
      commands.get(name) ||
      Array.from(commands.values()).find(c => c.aliases?.includes(name));

    if (!command) return;

    try {
      await command.execute(msg, args);
    } catch (err) {
      console.error(err);
      msg.reply("⚠️ Command error");
    }
  });
}
