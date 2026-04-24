import Rcon from "rcon-client";

let rcon = null;
let connected = false;
let connecting = false;

// =====================
// CONNECT (SAFE + AUTO RETRY)
// =====================
export async function connectRcon() {
  if (connected || connecting) return;

  connecting = true;

  try {
    rcon = await Rcon.Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    connected = true;
    connecting = false;

    console.log("🎮 RCON connected");
  } catch (err) {
    connected = false;
    connecting = false;

    console.log("⚠️ RCON offline — retrying in 10s");

    setTimeout(connectRcon, 10000);
  }
}

// =====================
// SEND COMMAND SAFELY
// =====================
export async function runCommand(cmd) {
  try {
    if (!connected || !rcon) {
      throw new Error("RCON_NOT_READY");
    }

    return await rcon.send(cmd);
  } catch (err) {
    connected = false;

    console.log("⚠️ RCON failed, will retry connection");

    // try reconnect in background
    setTimeout(connectRcon, 5000);

    throw err;
  }
}

// =====================
// STATUS CHECK
// =====================
export function isRconOnline() {
  return connected;
}

// =====================
// SAFE STARTUP AUTO CONNECT
// =====================
connectRcon();
