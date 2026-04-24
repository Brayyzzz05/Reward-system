import Rcon from "rcon-client";

let rcon = null;

export async function connectRcon() {
  try {
    rcon = await Rcon.Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    console.log("🎮 RCON connected");
  } catch (err) {
    console.log("⚠️ RCON offline (bot still works)");
  }
}

export async function runCommand(cmd) {
  if (!rcon) throw new Error("RCON not connected");
  return rcon.send(cmd);
}