import Rcon from "rcon-client";

let rcon;
let connected = false;

let retry = 5000;
const MAX = 60000;

export async function connectRcon() {
  try {
    console.log("🔄 Connecting RCON...");

    rcon = await Rcon.Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    await rcon.send("list");

    connected = true;
    retry = 5000;

    console.log("🎮 RCON connected");
  } catch (err) {
    connected = false;

    console.log(`⚠️ RCON offline retrying in ${retry / 1000}s`);

    setTimeout(connectRcon, retry);
    retry = Math.min(retry * 2, MAX);
  }
}

export async function runCommand(cmd) {
  if (!rcon || !connected) throw new Error("RCON_OFFLINE");

  try {
    return await rcon.send(cmd);
  } catch (err) {
    connected = false;
    setTimeout(connectRcon, 3000);
    throw err;
  }
}

// heartbeat
setInterval(async () => {
  if (!connected || !rcon) return;

  try {
    await rcon.send("list");
  } catch {
    connected = false;
    setTimeout(connectRcon, 3000);
  }
}, 15000);
