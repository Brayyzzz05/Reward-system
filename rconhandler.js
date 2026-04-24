import Rcon from "rcon-client";

// connection (keep this global so it doesn't reconnect every time)
let rcon;

export async function connectRcon() {
  rcon = await Rcon.Rcon.connect({
    host: process.env.RCON_HOST,
    port: process.env.RCON_PORT,
    password: process.env.RCON_PASSWORD
  });

  console.log("🎮 RCON connected");
}

// run command safely
export async function runCommand(cmd) {
  if (!rcon) {
    throw new Error("RCON not connected");
  }

  return await rcon.send(cmd);
}