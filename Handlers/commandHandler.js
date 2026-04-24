const commands = new Map();

// =====================
// LOAD COMMANDS
// =====================
export async function loadCommands(client) {
  const files = ["roll.js", "verify.js"]; // add your commands here

  for (const file of files) {
    const cmd = await import(`../commands/${file}`);
    commands.set(cmd.default.name, cmd.default);
  }

  // =====================
  // MESSAGE HANDLER
  // =====================
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    const args = msg.content.trim().split(/ +/);
    const name = args.shift().toLowerCase();

    const command = commands.get(name);
    if (!command) return;

    try {
      await command.execute(msg, args);
    } catch (err) {
      console.error(err);
      msg.reply("⚠️ Command error");
    }
  });
}
