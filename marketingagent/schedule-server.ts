import "dotenv/config";
import { getNextPostingWindow, parseDateTime } from "./scheduling.js";
import { scheduleInCloud } from "./cloud-scheduler.js";

/**
 * Schedule a post for server-side publishing via Supabase + pg_cron.
 * The post will be published even if your PC is off.
 *
 * Usage (kept for backward-compat — prefer `npm run agent -- cloud-schedule`):
 *   npm run schedule-server -- <post-id> "<datetime>"
 *   npm run schedule-server -- 4 "2026-04-01 11:00"
 *   npm run schedule-server -- 4 "tomorrow 19:00"
 *   npm run schedule-server -- 4 next
 *
 * The actual SQL/Storage work lives in ./cloud-scheduler.ts.
 */

// Re-exported for backward-compat: agent.ts dynamically imports parseDateTime
// from "./schedule-server.js". Keep this surface stable.
export const getNextSlot = (): Date => getNextPostingWindow();
export { parseDateTime };

export async function schedulePostServer(postId: number, dateArg: string = "next"): Promise<void> {
  if (!postId) {
    throw new Error('Usage: npm run schedule-server -- <post-id> "<datetime>"');
  }
  const scheduledFor = parseDateTime(dateArg);
  const result = await scheduleInCloud(postId, scheduledFor);

  console.log(`\nScheduling post #${postId} for server-side publishing`);
  console.log(`   When: ${new Date(result.scheduledFor).toLocaleString()}`);
  console.log(`   Server id: ${result.cloudId}`);
  console.log("   Platforms: Facebook, Instagram");
  console.log("   The post will be published automatically — even if your PC is off.\n");
}

async function main() {
  const postId = parseInt(process.argv[2]);
  const dateArg = process.argv[3] || "next";

  if (!postId) {
    console.error('Usage: npm run schedule-server -- <post-id> "<datetime>"');
    console.error('       npm run schedule-server -- 4 "2026-04-01 11:00"');
    console.error("       npm run schedule-server -- 4 next");
    process.exit(1);
  }

  try {
    await schedulePostServer(postId, dateArg);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("schedule-server.ts")) {
  main();
}
