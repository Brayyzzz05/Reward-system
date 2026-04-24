import db from "../core/database.js";
import { runCommand } from "../core/rconHandler.js";

export function startRewardWorker() {
  setInterval(async () => {
    const res = await db.query(
      "SELECT * FROM reward_queue WHERE status='pending' LIMIT 10"
    );

    for (const row of res.rows) {
      try {
        await runCommand(row.command);

        await db.query(
          "UPDATE reward_queue SET status='delivered' WHERE id=$1",
          [row.id]
        );

        console.log("🎁 Sent queued reward:", row.command);
      } catch {
        // keep pending
      }
    }
  }, 5000);
}
