import Rcon from "rcon-client";

let rcon = null;
let connected = false;

// =====================
// BACKOFF STATE
// =====================
let retryDelay = 5000; // start at 5s
const MAX_DELAY = 60000; // max 60s

// =====================
// CONNECT FUNCTION
// =====================
export async function connectRcon() {
  try {
    console.log("🔄 Trying RCON connection...");

    rcon = await Rcon.Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    connected = true;
    retryDelay = 5000; // reset backoff on success

    console.log("🎮 RCON connected successfully");
  } catch (err) {
    connected = false;

    console.log(`⚠️ RCON offline. Retrying in ${retryDelay / 1000}s`);

    // exponential backoff
    setTimeout(connectRcon, retryDelay);

    retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
  }
}

// =====================
// SAFE COMMAND EXECUTION
// =====================
export async function runCommand(cmd) {
  if (!connected || !rcon) {
    throw new Error("RCON_NOT_CONNECTED");
  }

  return await rcon.send(cmd);
}

// =====================
// STATUS
// =====================
export function isRconOnline() {
  return connected;
}

// =====================
// AUTO START (IMPORTANT)
// =====================
connectRcon();
