import "dotenv/config";

/**
 * Marketing Dashboard — Review, approve, schedule, and publish posts.
 *
 * Usage: npm run dashboard
 * Opens at http://localhost:4200
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { ensurePublicUrl } from "./upload-image.js";

const PORT = 4200;
const POSTS_FILE = "posts.json";
const SCHEDULE_FILE = "schedule.json";
const BLOTATO_API_URL = "https://backend.blotato.com/v2/posts";

// ── Types ──

interface Post {
  id: number;
  topic: string;
  text: string;
  aiScore: number;
  createdAt: string;
  status: "draft" | "approved" | "scheduled" | "posted" | "failed" | "rejected";
  scheduledFor?: string;
  imagePath?: string;
  blotato?: {
    postId?: string;
    platforms: string[];
    postedAt?: string;
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
  writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function loadSchedule(): ScheduleEntry[] {
  if (!existsSync(SCHEDULE_FILE)) return [];
  return JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8"));
}

function saveSchedule(schedule: ScheduleEntry[]): void {
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
}

// ── Blotato ──

async function publishToBlotato(text: string, platforms: string[], imageUrl?: string): Promise<{ success: boolean; postId?: string; error?: string }> {
  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) return { success: false, error: "BLOTATO_API_KEY not set" };

  // Upload local images to Supabase Storage so Blotato gets a public URL
  imageUrl = await ensurePublicUrl(imageUrl);

  const fbPageId = process.env.BLOTATO_FB_PAGE_ID;

  try {
    const results: { platform: string; success: boolean; postId?: string; error?: string }[] = [];

    for (const platform of platforms) {
      const accountId = platform === 'instagram'
        ? process.env.BLOTATO_IG_ACCOUNT_ID
        : process.env.BLOTATO_FB_ACCOUNT_ID;
      if (!accountId) {
        results.push({ platform, success: false, error: `BLOTATO_${platform === 'instagram' ? 'IG' : 'FB'}_ACCOUNT_ID not set` });
        continue;
      }

      // Instagram requires an image — skip if text-only
      if (platform === 'instagram' && !imageUrl) {
        results.push({ platform, success: false, error: 'Instagram requires an image — skipped' });
        continue;
      }

      const target: Record<string, string> = { targetType: platform };
      if (platform === "facebook") {
        if (!fbPageId) {
          results.push({ platform, success: false, error: "BLOTATO_FB_PAGE_ID not set — required for Facebook posts" });
          continue;
        }
        target.pageId = fbPageId;
      }

      const res = await fetch(BLOTATO_API_URL, {
        method: "POST",
        headers: { "blotato-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          post: {
            accountId,
            content: { text, mediaUrls: imageUrl ? [imageUrl] : [], platform },
            target,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        results.push({ platform, success: false, error: `Blotato API ${res.status}: ${errorText.slice(0, 200)}` });
        continue;
      }

      const data = await res.json();
      results.push({ platform, success: true, postId: data.postSubmissionId || data.id || data.postId });
    }

    const allFailed = results.every((r) => !r.success);
    const firstSuccess = results.find((r) => r.success);
    const errors = results.filter((r) => !r.success).map((r) => `${r.platform}: ${r.error}`);

    if (allFailed) {
      return { success: false, error: `All platforms failed — ${errors.join("; ")}` };
    }

    return {
      success: true,
      postId: firstSuccess?.postId,
      ...(errors.length > 0 ? { error: `Partial failure — ${errors.join("; ")}` } : {}),
    };
  } catch (err) {
    return { success: false, error: `Network error posting to Blotato: ${(err as Error).message}` };
  }
}

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

  // POST /api/posts/:id/schedule
  if (method === "POST" && path.match(/^\/api\/posts\/(\d+)\/schedule$/)) {
    const id = parseInt(path.split("/")[3]);
    const body = JSON.parse(await readBody(req));
    const posts = loadPosts();
    const post = posts.find((p) => p.id === id);
    if (!post) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }

    const scheduledFor = body.scheduledFor || getNextPostingWindow();
    post.status = "scheduled";
    post.scheduledFor = scheduledFor;
    savePosts(posts);

    const schedule = loadSchedule();
    schedule.push({
      postId: id,
      scheduledFor,
      platforms: body.platforms || ["facebook", "instagram"],
      posted: false,
    });
    saveSchedule(schedule);

    res.end(JSON.stringify({ ...post, scheduledFor }));
    return;
  }

  // GET /api/schedule
  if (method === "GET" && path === "/api/schedule") {
    res.end(JSON.stringify(loadSchedule()));
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

function getNextPostingWindow(): string {
  const now = new Date();
  const hours = [11, 12, 19, 20];
  for (const h of hours) {
    if (h > now.getHours()) {
      now.setHours(h, 0, 0, 0);
      return now.toISOString();
    }
  }
  now.setDate(now.getDate() + 1);
  now.setHours(11, 0, 0, 0);
  return now.toISOString();
}

// ── Dashboard HTML ──

function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AstroDating Marketing Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #090b13; color: #f7f4ee; min-height: 100vh; }
    .header { padding: 24px 32px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 20px; font-weight: 600; }
    .header .badge { font-size: 11px; padding: 4px 12px; border-radius: 99px; background: rgba(233,69,96,0.15); color: #e94560; text-transform: uppercase; letter-spacing: 1px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; padding: 24px 32px; }
    .stat { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; text-align: center; }
    .stat .num { font-size: 28px; font-weight: 700; }
    .stat .label { font-size: 10px; color: #8e8a84; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
    .posts { padding: 0 32px 32px; }
    .post { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 20px; margin-bottom: 12px; transition: border-color 0.2s; }
    .post:hover { border-color: rgba(255,255,255,0.16); }
    .post-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .post-meta { font-size: 12px; color: #8e8a84; }
    .post-status { font-size: 11px; padding: 3px 10px; border-radius: 99px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .status-approved { background: rgba(52,211,153,0.15); color: #34d399; }
    .status-scheduled { background: rgba(96,165,250,0.15); color: #60a5fa; }
    .status-posted { background: rgba(147,51,234,0.15); color: #9333ea; }
    .status-failed { background: rgba(248,113,113,0.15); color: #f87171; }
    .status-rejected { background: rgba(107,114,128,0.15); color: #6b7280; }
    .status-draft { background: rgba(255,255,255,0.08); color: #8e8a84; }
    .post-text { font-size: 16px; line-height: 1.6; margin-bottom: 16px; }
    .post-score { font-size: 12px; color: #8e8a84; margin-bottom: 12px; }
    .post-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { padding: 8px 16px; border-radius: 12px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn:hover { transform: translateY(-1px); }
    .btn-approve { background: #34d399; color: #000; }
    .btn-reject { background: rgba(255,255,255,0.08); color: #8e8a84; border: 1px solid rgba(255,255,255,0.12); }
    .btn-publish { background: #e94560; color: #fff; }
    .btn-schedule { background: rgba(96,165,250,0.15); color: #60a5fa; border: 1px solid rgba(96,165,250,0.3); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .empty { text-align: center; padding: 60px; color: #8e8a84; }
    .refresh { padding: 8px 16px; border-radius: 12px; background: rgba(255,255,255,0.06); color: #f7f4ee; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>AstroDating Marketing</h1>
    </div>
    <div style="display:flex;gap:12px;align-items:center;">
      <span class="badge" id="auto-refresh">Auto-refresh: ON</span>
      <button class="refresh" onclick="loadAll()">Refresh</button>
    </div>
  </div>
  <div class="stats" id="stats"></div>
  <div class="posts" id="posts"></div>

  <script>
    async function api(path, method = 'GET', body) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      return res.json();
    }

    async function loadStats() {
      const s = await api('/api/stats');
      document.getElementById('stats').innerHTML = [
        { num: s.total, label: 'Total' },
        { num: s.approved, label: 'Approved' },
        { num: s.scheduled, label: 'Scheduled' },
        { num: s.posted, label: 'Posted' },
        { num: s.failed, label: 'Failed' },
        { num: s.avgScore + '/100', label: 'Avg Score' },
      ].map(x => '<div class="stat"><div class="num">' + x.num + '</div><div class="label">' + x.label + '</div></div>').join('');
    }

    async function loadPosts() {
      const posts = await api('/api/posts');
      const el = document.getElementById('posts');
      if (!posts.length) { el.innerHTML = '<div class="empty">No posts yet. Run: npm run agent -- generate "topic"</div>'; return; }

      el.innerHTML = posts.sort((a,b) => b.id - a.id).map(p => {
        const date = new Date(p.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const canApprove = ['draft'].includes(p.status);
        const canPublish = ['approved'].includes(p.status);
        const canSchedule = ['approved'].includes(p.status);
        const canReject = ['draft', 'approved'].includes(p.status);

        return '<div class="post">' +
          '<div class="post-header">' +
            '<div class="post-meta">#' + p.id + ' · ' + date + ' · ' + (p.topic || 'no topic') + '</div>' +
            '<span class="post-status status-' + p.status + '">' + p.status + '</span>' +
          '</div>' +
          '<div class="post-text">' + escHtml(p.text) + '</div>' +
          '<div class="post-score">AI Score: ' + p.aiScore + '/100' +
            (p.scheduledFor ? ' · Scheduled: ' + new Date(p.scheduledFor).toLocaleString() : '') +
            (p.blotato?.postedAt ? ' · Posted: ' + new Date(p.blotato.postedAt).toLocaleString() : '') +
            (p.blotato?.error ? ' · Error: ' + escHtml(p.blotato.error) : '') +
          '</div>' +
          '<div class="post-actions">' +
            (canApprove ? '<button class="btn btn-approve" onclick="action(' + p.id + ',\\'approve\\')">Approve</button>' : '') +
            (canPublish ? '<button class="btn btn-publish" onclick="action(' + p.id + ',\\'publish-now\\')">Publish Now</button>' : '') +
            (canSchedule ? '<button class="btn btn-schedule" onclick="action(' + p.id + ',\\'schedule\\')">Schedule Next</button>' : '') +
            (canReject ? '<button class="btn btn-reject" onclick="action(' + p.id + ',\\'reject\\')">Reject</button>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }

    function escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    async function action(id, act) {
      await api('/api/posts/' + id + '/' + act, 'POST', act === 'schedule' ? { scheduledFor: null } : undefined);
      loadAll();
    }

    function loadAll() { loadStats(); loadPosts(); }
    loadAll();
    setInterval(loadAll, 15000);
  </script>
</body>
</html>`;
}

// ── Server ──

const server = createServer(async (req, res) => {
  const url = req.url || "/";

  if (url.startsWith("/api/")) {
    await handleAPI(req, res);
    return;
  }

  // Serve dashboard
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(renderDashboard());
});

startScheduler();

server.listen(PORT, () => {
  console.log(`\n🚀 Marketing Dashboard running at http://localhost:${PORT}\n`);
  console.log(`  📋 View and manage posts`);
  console.log(`  ✅ Approve / ❌ Reject`);
  console.log(`  📤 Publish Now / ⏰ Schedule Next`);
  console.log(`  🔄 Auto-refresh every 15s\n`);
});
