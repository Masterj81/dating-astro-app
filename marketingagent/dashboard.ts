import "dotenv/config";

/**
 * Marketing Dashboard — Review, approve, schedule, and publish posts.
 *
 * Usage: npm run dashboard
 * Opens at http://localhost:4200
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { atomicWriteJson } from "./lib.js";
import { POSTS_FILE, SCHEDULE_FILE } from "./constants.js";
import { getNextPostingWindowISO } from "./scheduling.js";
import { submitToBlotato } from "./blotato.js";
import { checkBasicAuthHeader } from "./dashboard-auth.js";

const PORT = 4200;
const HOST = "127.0.0.1"; // loopback only — not accessible from the LAN/WiFi
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN?.trim() || "";
const __dirname = dirname(fileURLToPath(import.meta.url));

// Basic Auth gate. Off by default — loopback alone is usually enough for a
// single-user laptop. When DASHBOARD_TOKEN is set, every request must carry
// `Authorization: Basic <base64(user:DASHBOARD_TOKEN)>`. The logic lives in
// ./dashboard-auth.ts so it can be unit-tested without booting the server.
function isAuthorized(req: IncomingMessage): boolean {
  return checkBasicAuthHeader(req.headers.authorization, DASHBOARD_TOKEN);
}

function send401(res: ServerResponse): void {
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="AstroDating Marketing", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end("Authentication required.");
}

// ── Types ──

interface Post {
  id: number;
  topic: string;
  text: string;
  aiScore: number;
  createdAt: string;
  status: "draft" | "approved" | "scheduled" | "posted" | "failed" | "rejected";
  scheduledFor?: string;
  // Set by `npm run agent -- cloud-schedule`. Presence means Supabase pg_cron
  // owns this post; the local dashboard must not also publish it.
  scheduledServerId?: string;
  imagePath?: string;
  blotato?: {
    postId?: string;
    platforms: string[];
    postedAt?: string;
    queueMode?: "scheduled-time" | "next-free-slot";
    error?: string;
  };
}

interface ScheduleEntry {
  postId: number;
  scheduledFor: string;
  platforms: string[];
  posted: boolean;
}

// ── Data ──

function loadPosts(): Post[] {
  if (!existsSync(POSTS_FILE)) return [];
  return JSON.parse(readFileSync(POSTS_FILE, "utf-8"));
}

function savePosts(posts: Post[]): void {
  atomicWriteJson(POSTS_FILE, posts);
}

function loadSchedule(): ScheduleEntry[] {
  if (!existsSync(SCHEDULE_FILE)) return [];
  return JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8"));
}

function saveSchedule(schedule: ScheduleEntry[]): void {
  atomicWriteJson(SCHEDULE_FILE, schedule);
}

// getNextPostingWindow lives in ./scheduling.ts so the dashboard, the CLI,
// and schedule-server all walk the same window list. Local alias keeps the
// rest of this file readable.
const getNextPostingWindow = (from?: Date) => getNextPostingWindowISO(from);

/**
 * Schedule via Blotato's native queue.
 * - `scheduledTime`: explicit instant chosen by the user
 * - `useNextFreeSlot`: let Blotato spread the queue on its side
 *
 * Once Blotato accepts the schedule, IT owns publication — even if our laptop
 * is off at the scheduled time. We remove any legacy `schedule.json` entry for
 * the same post so the local setInterval scheduler can't also try to publish.
 */
async function scheduleViaBlotato(
  postId: number,
  options: { scheduledTime?: Date; useNextFreeSlot?: boolean },
  platforms: string[] = ["facebook", "instagram"],
): Promise<Post> {
  const posts = loadPosts();
  const post = posts.find((p) => p.id === postId);
  if (!post) throw new Error(`Post #${postId} not found`);

  const result = await submitToBlotato(post.text, platforms, post.imagePath, options);
  if (!result.success) {
    throw new Error(result.error || "Blotato scheduling failed");
  }

  // Re-load to avoid clobbering a concurrent write (scheduler, another request).
  const fresh = loadPosts();
  const freshTarget = fresh.find((p) => p.id === postId);
  if (!freshTarget) throw new Error(`Post #${postId} disappeared`);
  freshTarget.status = "scheduled";
  if (result.scheduledTime) {
    freshTarget.scheduledFor = result.scheduledTime;
  } else if (options.scheduledTime) {
    freshTarget.scheduledFor = options.scheduledTime.toISOString();
  } else {
    delete freshTarget.scheduledFor;
  }
  freshTarget.blotato = {
    postId: result.postId,
    platforms,
    queueMode: options.useNextFreeSlot ? "next-free-slot" : "scheduled-time",
    ...(result.error ? { error: result.error } : {}),
  };
  savePosts(fresh);

  // Purge any leftover schedule.json entry for this post (defense in depth —
  // the local setInterval scheduler must not also publish).
  const schedule = loadSchedule();
  const filtered = schedule.filter((e) => e.postId !== postId);
  if (filtered.length !== schedule.length) saveSchedule(filtered);

  return freshTarget;
}

function spreadScheduledPosts(): { updated: number; posts: Post[] } {
  const posts = loadPosts();
  const activeSchedule = loadSchedule()
    .filter((entry) => !entry.posted)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  let cursor = new Date();
  let updated = 0;

  for (const entry of activeSchedule) {
    const post = posts.find((item) => item.id === entry.postId);
    if (!post) continue;

    const nextSlot = getNextPostingWindow(cursor);
    entry.scheduledFor = nextSlot;
    post.scheduledFor = nextSlot;
    post.status = "scheduled";
    cursor = new Date(nextSlot);
    cursor.setMinutes(cursor.getMinutes() + 1);
    updated++;
  }

  savePosts(posts);
  saveSchedule(activeSchedule);
  return { updated, posts };
}

// ── Blotato ──
// Delegates to ./blotato.ts so the publish path matches the agent CLI exactly.
const publishToBlotato = (text: string, platforms: string[], imageUrl?: string) =>
  submitToBlotato(text, platforms, imageUrl);

// ── Scheduling loop ──

function startScheduler(): void {
  setInterval(async () => {
    const schedule = loadSchedule();
    const posts = loadPosts();
    const now = new Date().toISOString();
    let changed = false;

    for (const entry of schedule) {
      if (entry.posted || entry.scheduledFor > now) continue;

      const post = posts.find((p) => p.id === entry.postId);
      if (!post || post.status === "posted") {
        entry.posted = true;
        changed = true;
        continue;
      }

      // Belt-and-suspenders: a cloud-scheduled post should never have ended up
      // in schedule.json, but if it did (manual edit, legacy state), refuse to
      // double-publish. The Supabase pg_cron job owns it.
      if (post.scheduledServerId) {
        console.log(`⏰ Skipping post #${post.id}: cloud-scheduled (server id ${post.scheduledServerId}).`);
        entry.posted = true;
        changed = true;
        continue;
      }

      console.log(`⏰ Publishing scheduled post #${post.id}...`);
      const result = await publishToBlotato(post.text, entry.platforms, post.imagePath);

      if (result.success) {
        post.status = "posted";
        post.blotato = { postId: result.postId, platforms: entry.platforms, postedAt: new Date().toISOString() };
        entry.posted = true;
        console.log(`  ✅ Posted! Blotato ID: ${result.postId}`);
      } else {
        post.status = "failed";
        post.blotato = { platforms: entry.platforms, error: result.error };
        entry.posted = true;
        console.log(`  ❌ Failed: ${result.error}`);
      }
      changed = true;
    }

    if (changed) {
      savePosts(posts);
      saveSchedule(schedule);
    }
  }, 30_000); // Check every 30 seconds
}

// ── API handlers ──

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

async function handleAPI(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || "GET";

  res.setHeader("Content-Type", "application/json");

  // GET /api/posts
  if (method === "GET" && path === "/api/posts") {
    const posts = loadPosts();
    res.end(JSON.stringify(posts));
    return;
  }

  // POST /api/posts/:id/approve
  if (method === "POST" && path.match(/^\/api\/posts\/(\d+)\/approve$/)) {
    const id = parseInt(path.split("/")[3]);
    const posts = loadPosts();
    const post = posts.find((p) => p.id === id);
    if (!post) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    post.status = "approved";
    savePosts(posts);
    res.end(JSON.stringify(post));
    return;
  }

  // POST /api/posts/:id/reject
  if (method === "POST" && path.match(/^\/api\/posts\/(\d+)\/reject$/)) {
    const id = parseInt(path.split("/")[3]);
    const posts = loadPosts();
    const post = posts.find((p) => p.id === id);
    if (!post) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    post.status = "rejected";
    savePosts(posts);
    res.end(JSON.stringify(post));
    return;
  }

  // POST /api/posts/:id/publish-now
  if (method === "POST" && path.match(/^\/api\/posts\/(\d+)\/publish-now$/)) {
    const id = parseInt(path.split("/")[3]);
    const posts = loadPosts();
    const post = posts.find((p) => p.id === id);
    if (!post) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }

    // Server-side guard mirroring the dashboard UI: refuse to publish a post
    // that is owned by the Supabase pg_cron path. The user can run
    // `npm run agent -- cloud-sync` if they need the local view to catch up.
    if (post.scheduledServerId) {
      res.writeHead(409);
      res.end(JSON.stringify({
        error: `Post #${id} is cloud-scheduled (server id ${post.scheduledServerId}). Refused to avoid double publication.`,
      }));
      return;
    }

    const result = await publishToBlotato(post.text, ["facebook", "instagram"], post.imagePath);
    if (result.success) {
      post.status = "posted";
      post.blotato = { postId: result.postId, platforms: ["facebook", "instagram"], postedAt: new Date().toISOString() };
    } else {
      post.status = "failed";
      post.blotato = { platforms: ["facebook", "instagram"], error: result.error };
    }
    savePosts(posts);
    res.end(JSON.stringify(post));
    return;
  }

  // POST /api/posts/:id/generate-image
  // Calls Gemini (or Pollinations fallback) to generate an image for the post.
  // Picks the best variant via Gemini Vision scoring when available.
  // Takes 5-30s — the browser keeps the request open the whole time.
  if (method === "POST" && path.match(/^\/api\/posts\/(\d+)\/generate-image$/)) {
    const id = parseInt(path.split("/")[3]);
    const posts = loadPosts();
    const target = posts.find((p) => p.id === id);
    if (!target) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    if (target.imagePath) {
      res.writeHead(409);
      res.end(JSON.stringify({ error: `Post #${id} already has an image. Delete imagePath first to regenerate.`, imagePath: target.imagePath }));
      return;
    }
    try {
      const { generateBestVariant, detectSignFromText } = await import("./.pi/extensions/image-generator.js");
      const isViral = target.topic.startsWith("[viral-fb]");
      const postType: "short" | "viral" = isViral ? "viral" : "short";
      const count = isViral ? 3 : 2;
      const detectedSign = detectSignFromText(target.text);
      const result = await generateBestVariant(target.text, { count, postType, signContext: detectedSign });

      if (!result.success || !result.filePath) {
        res.writeHead(502);
        res.end(JSON.stringify({ error: result.error || "image generation failed" }));
        return;
      }
      // Re-read posts.json in case the scheduler wrote to it during the
      // 5-30s Gemini call, then update just this post's imagePath.
      const fresh = loadPosts();
      const freshTarget = fresh.find((p) => p.id === id);
      if (!freshTarget) { res.writeHead(404); res.end('{"error":"Post disappeared"}'); return; }
      freshTarget.imagePath = result.filePath;
      savePosts(fresh);
      res.end(JSON.stringify({
        success: true,
        post: freshTarget,
        imagePath: result.filePath,
        scores: result.scores,
        selectedIndex: result.selectedIndex,
      }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: `Generation crashed: ${(err as Error).message}` }));
    }
    return;
  }

  // GET /api/images/:filename
  // Serves generated PNGs to the dashboard so the thumbnail renders in-browser.
  // Sandboxed to generated-images/ — no path traversal.
  if (method === "GET" && path.startsWith("/api/images/")) {
    const name = path.slice("/api/images/".length);
    if (!/^post-[\w.-]+\.(png|jpg|jpeg|webp)$/i.test(name)) {
      res.writeHead(400);
      res.end('{"error":"Invalid image name"}');
      return;
    }
    const filePath = join("generated-images", name);
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('{"error":"Not found"}');
      return;
    }
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=3600" });
    res.end(readFileSync(filePath));
    return;
  }

  // POST /api/posts/:id/schedule
  if (method === "POST" && path.match(/^\/api\/posts\/(\d+)\/schedule$/)) {
    const id = parseInt(path.split("/")[3]);
    const existing = loadPosts().find((p) => p.id === id);
    if (!existing) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    if (existing.scheduledServerId) {
      res.writeHead(409);
      res.end(JSON.stringify({ error: `Post #${id} is cloud-scheduled (Supabase). Dashboard scheduling refused.` }));
      return;
    }
    const body = JSON.parse(await readBody(req));
    const platforms = body.platforms || ["facebook", "instagram"];
    let whenDate: Date | undefined;
    if (body.scheduledFor) {
      whenDate = new Date(body.scheduledFor);
      if (Number.isNaN(whenDate.getTime())) {
        res.writeHead(400);
        res.end('{"error":"scheduledFor is not a valid date"}');
        return;
      }
    }
    try {
      const post = whenDate
        ? await scheduleViaBlotato(id, { scheduledTime: whenDate }, platforms)
        : await scheduleViaBlotato(id, { useNextFreeSlot: true }, platforms);
      res.end(JSON.stringify(post));
    } catch (err) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  // POST /api/posts/:id/reschedule
  if (method === "POST" && path.match(/^\/api\/posts\/(\d+)\/reschedule$/)) {
    const id = parseInt(path.split("/")[3]);
    const existing = loadPosts().find((p) => p.id === id);
    if (!existing) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    if (existing.scheduledServerId) {
      res.writeHead(409);
      res.end(JSON.stringify({ error: `Post #${id} is cloud-scheduled (Supabase). Dashboard rescheduling refused.` }));
      return;
    }
    const body = JSON.parse(await readBody(req));
    if (!body.scheduledFor) {
      res.writeHead(400);
      res.end('{"error":"scheduledFor is required"}');
      return;
    }
    const whenDate = new Date(body.scheduledFor);
    if (Number.isNaN(whenDate.getTime())) {
      res.writeHead(400);
      res.end('{"error":"scheduledFor is not a valid date"}');
      return;
    }
    try {
      const post = await scheduleViaBlotato(
        id,
        { scheduledTime: whenDate },
        body.platforms || ["facebook", "instagram"],
      );
      res.end(JSON.stringify(post));
    } catch (err) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  // POST /api/schedule/spread
  if (method === "POST" && path === "/api/schedule/spread") {
    const result = spreadScheduledPosts();
    res.end(JSON.stringify(result));
    return;
  }

  // GET /api/schedule
  if (method === "GET" && path === "/api/schedule") {
    res.end(JSON.stringify(loadSchedule()));
    return;
  }

  // POST /api/generate  body: { topic: string }
  // Generates one short post via Anthropic, scores it, saves on first pass.
  // Returns the saved post + the per-attempt log so the UI can show retries.
  // Does NOT push to Blotato — users approve/schedule afterwards like any post.
  if (method === "POST" && path === "/api/generate") {
    let body: { topic?: string };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400);
      res.end('{"error":"Invalid JSON body"}');
      return;
    }
    const topic = (body.topic ?? "").trim();
    if (!topic) {
      res.writeHead(400);
      res.end('{"error":"Topic is required"}');
      return;
    }
    if (topic.length > 200) {
      res.writeHead(400);
      res.end('{"error":"Topic too long (max 200 chars)"}');
      return;
    }
    try {
      const { generateShortPost } = await import("./generator.js");
      const result = await generateShortPost(topic);
      if (!result.success) {
        res.writeHead(422);
      }
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: `Generation crashed: ${(err as Error).message}` }));
    }
    return;
  }

  // GET /api/stats
  if (method === "GET" && path === "/api/stats") {
    const posts = loadPosts();
    res.end(JSON.stringify({
      total: posts.length,
      approved: posts.filter((p) => p.status === "approved").length,
      scheduled: posts.filter((p) => p.status === "scheduled").length,
      posted: posts.filter((p) => p.status === "posted").length,
      failed: posts.filter((p) => p.status === "failed").length,
      rejected: posts.filter((p) => p.status === "rejected").length,
      avgScore: posts.length > 0 ? Math.round(posts.reduce((s, p) => s + p.aiScore, 0) / posts.length) : 0,
    }));
    return;
  }

  res.writeHead(404);
  res.end('{"error":"Not found"}');
}

// ── Dashboard HTML (served from dashboard.html) ──
// We read the file once at startup so we don't hit disk per request, and
// don't pay the ~470-line template-literal cost in dashboard.ts itself.
const DASHBOARD_HTML_PATH = join(__dirname, "dashboard.html");
const DASHBOARD_HTML = readFileSync(DASHBOARD_HTML_PATH, "utf-8");

// ── Server ──

const server = createServer(async (req, res) => {
  if (!isAuthorized(req)) {
    send401(res);
    return;
  }

  const url = req.url || "/";

  if (url.startsWith("/api/")) {
    await handleAPI(req, res);
    return;
  }

  // Serve dashboard
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(DASHBOARD_HTML);
});

startScheduler();

server.listen(PORT, HOST, () => {
  console.log(`\n🚀 Marketing Dashboard running at http://${HOST}:${PORT}\n`);
  console.log(`  🔒 Bound to loopback only — not reachable from the LAN/WiFi.`);
  if (DASHBOARD_TOKEN) {
    console.log(`  🔑 Basic Auth enabled (DASHBOARD_TOKEN set). Username = anything, password = your token.`);
  } else {
    console.log(`  💡 Set DASHBOARD_TOKEN in .env for belt-and-suspenders Basic Auth.`);
  }
  console.log(`  📋 View and manage posts`);
  console.log(`  ✅ Approve / ❌ Reject`);
  console.log(`  📤 Publish Now / ⏰ Schedule Next`);
  console.log(`  🔄 Auto-refresh every 15s\n`);
});
