import Rcon from "rcon-client";

let rcon = null;
let connected = false;

// =====================
// CONNECT (NON-BLOCKING)
// =====================
export async function connectRcon() {
  try {
    rcon = await Rcon.Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    connected = true;
    console.log("🎮 RCON connected");
  } catch (err) {
    connected = false;
    console.log("⚠️ RCON offline — bot still running");
  }
}

// =====================
// SAFE COMMAND RUNNER
// =====================
export async function runCommand(cmd) {
  if (!connected || !rcon) {
    throw new Error("RCON_OFFLINE");
  }

  return await rcon.send(cmd);
}

// =====================
// STATUS
// =====================
export function isRconOnline() {
  return connected;
}
