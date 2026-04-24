import Rcon from "rcon-client";

let rcon = null;
let connected = false;

// =====================
// SMART BACKOFF STATE
// =====================
let retryDelay = 5000; // start 5s
const MAX_DELAY = 60000; // max 60s

// =====================
// CONNECT FUNCTION
// =====================
export async function connectRcon() {
  try {
    console.log("🔄 Attempting RCON connection...");

    rcon = await Rcon.Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    // REAL CONNECTION TEST (IMPORTANT)
    await rcon.send("list");

    connected = true;
    retryDelay = 5000; // reset backoff

    console.log("🎮 RCON connected successfully");
  } catch (err) {
    connected = false;

    console.log(`⚠️ RCON offline. Retrying in ${retryDelay / 1000}s`);

    setTimeout(connectRcon, retryDelay);

    // exponential backoff
    retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
  }
}

// =====================
// SAFE COMMAND EXECUTION
// =====================
export async function runCommand(cmd) {
  if (!rcon || !connected) {
    throw new Error("RCON_NOT_CONNECTED");
  }

  try {
    return await rcon.send(cmd);
  } catch (err) {
    console.log("⚠️ RCON dropped during command");

    connected = false;

    setTimeout(connectRcon, 3000);

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
// HEARTBEAT (PREVENT FAKE CONNECTION)
// =====================
setInterval(async () => {
  if (!connected || !rcon) return;

  try {
    await rcon.send("list");
  } catch (err) {
    console.log("💔 RCON heartbeat failed — reconnecting");

    connected = false;

    setTimeout(connectRcon, 3000);
  }
}, 15000);

// =====================
// AUTO START
// =====================
connectRcon();
