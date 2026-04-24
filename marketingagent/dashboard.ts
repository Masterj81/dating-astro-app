import "dotenv/config";

/**
 * Marketing Dashboard — Review, approve, schedule, and publish posts.
 *
 * Usage: npm run dashboard
 * Opens at http://localhost:4200
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { ensurePublicUrl } from "./upload-image.js";
import { atomicWriteJson, fetchWithTimeout } from "./lib.js";

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
  atomicWriteJson(POSTS_FILE, posts);
}

function loadSchedule(): ScheduleEntry[] {
  if (!existsSync(SCHEDULE_FILE)) return [];
  return JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8"));
}

function saveSchedule(schedule: ScheduleEntry[]): void {
  atomicWriteJson(SCHEDULE_FILE, schedule);
}

function getNextPostingWindow(from = new Date()): string {
  // Always return a slot strictly in the future. The previous code returned
  // "now" itself if called at exactly 11:00:00.000, which surprised the
  // scheduler (it would publish in the same tick instead of the next window).
  const next = new Date(from);
  const hours = [11, 12, 19, 20];
  for (const hour of hours) {
    if (hour > next.getHours()) {
      next.setHours(hour, 0, 0, 0);
      return next.toISOString();
    }
  }
  next.setDate(next.getDate() + 1);
  next.setHours(11, 0, 0, 0);
  return next.toISOString();
}

function upsertScheduleEntry(
  postId: number,
  scheduledFor: string,
  platforms: string[] = ["facebook", "instagram"],
): ScheduleEntry {
  const schedule = loadSchedule();
  const existing = schedule.find((entry) => entry.postId === postId && !entry.posted);

  if (existing) {
    existing.scheduledFor = scheduledFor;
    existing.platforms = platforms;
    saveSchedule(schedule);
    return existing;
  }

  const entry: ScheduleEntry = {
    postId,
    scheduledFor,
    platforms,
    posted: false,
  };
  schedule.push(entry);
  saveSchedule(schedule);
  return entry;
}

function schedulePostLocally(
  postId: number,
  scheduledFor: string,
  platforms: string[] = ["facebook", "instagram"],
): Post {
  const posts = loadPosts();
  const post = posts.find((entry) => entry.id === postId);
  if (!post) {
    throw new Error("Post not found");
  }

  post.status = "scheduled";
  post.scheduledFor = scheduledFor;
  savePosts(posts);
  upsertScheduleEntry(postId, scheduledFor, platforms);
  return post;
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

      const res = await fetchWithTimeout(BLOTATO_API_URL, {
        method: "POST",
        timeoutMs: 30_000,
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
    try {
      const scheduledFor = body.scheduledFor || getNextPostingWindow();
      const post = schedulePostLocally(id, scheduledFor, body.platforms || ["facebook", "instagram"]);
      res.end(JSON.stringify({ ...post, scheduledFor }));
    } catch {
      res.writeHead(404);
      res.end('{"error":"Not found"}');
    }
    return;
  }

  // POST /api/posts/:id/reschedule
  if (method === "POST" && path.match(/^\/api\/posts\/(\d+)\/reschedule$/)) {
    const id = parseInt(path.split("/")[3]);
    const body = JSON.parse(await readBody(req));
    if (!body.scheduledFor) {
      res.writeHead(400);
      res.end('{"error":"scheduledFor is required"}');
      return;
    }
    try {
      const post = schedulePostLocally(id, new Date(body.scheduledFor).toISOString(), body.platforms || ["facebook", "instagram"]);
      res.end(JSON.stringify(post));
    } catch {
      res.writeHead(404);
      res.end('{"error":"Not found"}');
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
    .toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .tabs { display: flex; gap: 10px; padding: 18px 32px 0; }
    .tab { padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.04); color: #a8b0c2; border: 1px solid rgba(255,255,255,0.08); cursor: pointer; font-size: 13px; font-weight: 700; }
    .tab.active { background: rgba(96,165,250,0.18); color: #dbeafe; border-color: rgba(96,165,250,0.35); }
    .view { display: none; }
    .view.active { display: block; }
    .calendar-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 0 32px 16px; flex-wrap: wrap; }
    .calendar-range { font-size: 13px; color: #cbd5e1; font-weight: 700; letter-spacing: 0.2px; }
    .schedule-tools { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .datetime { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #f7f4ee; font-size: 13px; }
    .schedule-editor { margin-top: 12px; padding: 14px; border-radius: 16px; background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.22); }
    .schedule-editor-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #93c5fd; margin-bottom: 10px; }
    .schedule-editor-fields { display: flex; gap: 8px; flex-wrap: wrap; }
    .schedule-editor .datetime { min-width: 160px; }
    .schedule-editor-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .calendar-wrap { padding: 0 32px 32px; }
    .calendar-shell { overflow: auto; border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
    .calendar-header { display: grid; grid-template-columns: 72px repeat(7, minmax(160px, 1fr)); min-width: 1200px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
    .calendar-corner { border-right: 1px solid rgba(255,255,255,0.06); }
    .calendar-day-head { padding: 14px 12px; text-align: center; color: #aab6d3; font-size: 14px; border-right: 1px solid rgba(255,255,255,0.06); }
    .calendar-day-head.today { color: #f7f4ee; background: rgba(96,165,250,0.08); }
    .calendar-grid { position: relative; display: grid; grid-template-columns: 72px repeat(7, minmax(160px, 1fr)); min-width: 1200px; }
    .calendar-times { position: relative; }
    .calendar-time { height: 64px; padding-top: 4px; text-align: center; font-size: 12px; color: #6f7a91; border-top: 1px solid rgba(255,255,255,0.05); }
    .calendar-day-col { position: relative; height: 1024px; border-left: 1px solid rgba(255,255,255,0.06); background-image: linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 100% 64px; }
    .calendar-now { position: absolute; left: 72px; right: 0; height: 1px; background: #3b82f6; box-shadow: 0 0 0 1px rgba(59,130,246,0.2); z-index: 3; }
    .calendar-event { position: absolute; left: 8px; right: 8px; border-radius: 14px; padding: 10px; background: linear-gradient(180deg, rgba(59,130,246,0.28), rgba(30,41,59,0.88)); border: 1px solid rgba(147,197,253,0.35); box-shadow: 0 10px 24px rgba(2,6,23,0.35); overflow: hidden; z-index: 4; cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease; }
    .calendar-event:hover { transform: translateY(-1px); border-color: rgba(191,219,254,0.65); }
    .calendar-event-time { font-size: 11px; color: #bfdbfe; margin-bottom: 6px; }
    .calendar-event-title { font-size: 12px; font-weight: 700; line-height: 1.35; color: #eff6ff; }
    .calendar-event-meta { font-size: 11px; color: #cbd5e1; margin-top: 6px; }
    .calendar-empty { padding: 40px 20px; text-align: center; color: #8e8a84; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>AstroDating Marketing</h1>
    </div>
    <div class="toolbar">
      <span class="badge" id="auto-refresh">Rafraîchissement auto : ACTIF</span>
      <button class="refresh" onclick="spreadScheduled()">Répartir les posts planifiés</button>
      <button class="refresh" onclick="loadAll()">Rafraîchir</button>
    </div>
  </div>
  <div class="stats" id="stats"></div>
  <div class="tabs">
    <button class="tab active" id="tab-posts" onclick="setActiveView('posts')">Publications</button>
    <button class="tab" id="tab-calendar" onclick="setActiveView('calendar')">Calendrier</button>
  </div>
  <div class="view active" id="view-posts">
    <div class="posts" id="posts"></div>
  </div>
  <div class="view" id="view-calendar">
    <div class="calendar-toolbar">
      <div class="toolbar">
        <button class="refresh" onclick="changeCalendarWeek(-1)">Semaine précédente</button>
        <button class="refresh" onclick="jumpToCurrentWeek()">Aujourd'hui</button>
        <button class="refresh" onclick="changeCalendarWeek(1)">Semaine suivante</button>
      </div>
      <div class="calendar-range" id="calendar-range"></div>
    </div>
    <div class="calendar-wrap">
      <div id="calendar"></div>
    </div>
  </div>

  <script>
    let scheduleEditorState = {};
    let activeView = 'posts';
    let currentWeekStart = getStartOfWeek(new Date());

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
        { num: s.approved, label: 'Approuvés' },
        { num: s.scheduled, label: 'Planifiés' },
        { num: s.posted, label: 'Publiés' },
        { num: s.failed, label: 'Échecs' },
        { num: s.avgScore + '/100', label: 'Score moyen' },
      ].map(x => '<div class="stat"><div class="num">' + x.num + '</div><div class="label">' + x.label + '</div></div>').join('');
    }

    async function loadPosts() {
      const posts = await api('/api/posts');
      const el = document.getElementById('posts');
      if (!posts.length) { el.innerHTML = '<div class="empty">Aucune publication pour le moment. Lance: npm run agent -- generate "topic"</div>'; return; }

      el.innerHTML = posts.sort((a,b) => b.id - a.id).map(p => {
        const date = new Date(p.createdAt).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const canApprove = ['draft'].includes(p.status);
        const canPublish = ['approved'].includes(p.status);
        const canSchedule = ['approved'].includes(p.status);
        const canReschedule = ['scheduled'].includes(p.status);
        const canReject = ['draft', 'approved'].includes(p.status);
        const scheduledValue = p.scheduledFor ? toDatetimeLocal(p.scheduledFor) : '';
        const editorState = scheduleEditorState[p.id];
        const isEditorOpen = Boolean(editorState && editorState.open);

        return '<div class="post">' +
          '<div class="post-header">' +
            '<div class="post-meta">#' + p.id + ' · ' + date + ' · ' + (p.topic || 'sans sujet') + '</div>' +
            '<span class="post-status status-' + p.status + '">' + formatStatusLabel(p.status) + '</span>' +
          '</div>' +
          '<div class="post-text">' + escHtml(p.text) + '</div>' +
          '<div class="post-score">Score IA : ' + p.aiScore + '/100' +
            (p.scheduledFor ? ' · Planifié : ' + new Date(p.scheduledFor).toLocaleString('fr-CA') : '') +
            (p.blotato?.postedAt ? ' · Publié : ' + new Date(p.blotato.postedAt).toLocaleString('fr-CA') : '') +
            (p.blotato?.error ? ' · Erreur : ' + escHtml(p.blotato.error) : '') +
          '</div>' +
          '<div class="post-actions">' +
            (canApprove ? '<button class="btn btn-approve" onclick="action(' + p.id + ',\\'approve\\')">Approuver</button>' : '') +
            (canPublish ? '<button class="btn btn-publish" onclick="action(' + p.id + ',\\'publish-now\\')">Publier maintenant</button>' : '') +
            (canSchedule ? '<button class="btn btn-schedule" onclick="action(' + p.id + ',\\'schedule\\')">Planifier au prochain créneau</button>' : '') +
            ((canReschedule || canSchedule) ? '<button class="btn btn-schedule" onclick="toggleScheduleEditor(' + p.id + ', \\''
              + scheduledValue + '\\')">' + (isEditorOpen ? 'Fermer date et heure' : (canReschedule ? 'Changer date et heure' : 'Choisir date et heure')) + '</button>' : '') +
            (canReject ? '<button class="btn btn-reject" onclick="action(' + p.id + ',\\'reject\\')">Refuser</button>' : '') +
          '</div>' +
          renderScheduleEditor(p.id, canReschedule, canSchedule, scheduledValue) +
        '</div>';
      }).join('');
    }

    async function loadCalendar() {
      const posts = await api('/api/posts');
      const el = document.getElementById('calendar');
      const scheduledPosts = posts
        .filter((p) => p.status === 'scheduled' && p.scheduledFor)
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

      const start = new Date(currentWeekStart);
      const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
      const end = addDays(start, 7);
      const scheduledPostsForWeek = scheduledPosts.filter((post) => {
        const date = new Date(post.scheduledFor);
        return date >= start && date < end;
      });
      updateCalendarRangeLabel(start, days[6]);
      if (!scheduledPostsForWeek.length) {
        el.innerHTML = '<div class="calendar-shell"><div class="calendar-empty">Aucune publication planifiée pour cette semaine.</div></div>';
        return;
      }
      const hourStart = 6;
      const hourEnd = 22;
      const hourHeight = 64;
      const totalHeight = (hourEnd - hourStart) * hourHeight;
      const todayKey = formatDateKey(new Date());

      const dayHeaders = days.map((day) => {
        const key = formatDateKey(day);
        const label = day.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric' });
        return '<div class="calendar-day-head' + (key === todayKey ? ' today' : '') + '">' + label + '</div>';
      }).join('');

      const timeLabels = Array.from({ length: hourEnd - hourStart }, (_, index) => {
        const hour = hourStart + index;
        return '<div class="calendar-time">' + formatHourLabel(hour) + '</div>';
      }).join('');

      const dayColumns = days.map((day) => {
        const dayKey = formatDateKey(day);
        const events = scheduledPostsForWeek
          .filter((post) => formatDateKey(new Date(post.scheduledFor)) === dayKey)
          .map((post) => renderCalendarEvent(post, hourStart, hourHeight, totalHeight))
          .join('');

        return '<div class="calendar-day-col">' + events + '</div>';
      }).join('');

      const nowLine = renderNowLine(start, hourStart, hourEnd, hourHeight);

      el.innerHTML = '<div class="calendar-shell">' +
        '<div class="calendar-header">' +
          '<div class="calendar-corner"></div>' +
          dayHeaders +
        '</div>' +
        '<div class="calendar-grid" style="height:' + totalHeight + 'px">' +
          '<div class="calendar-times">' + timeLabels + '</div>' +
          dayColumns +
          nowLine +
        '</div>' +
      '</div>';
    }

    function escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    function toDatetimeLocal(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function formatDateKey(value) {
      const date = new Date(value);
      const pad = (n) => String(n).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function getStartOfWeek(date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
      return start;
    }

    function addDays(date, count) {
      const next = new Date(date);
      next.setDate(next.getDate() + count);
      return next;
    }

    function formatHourLabel(hour24) {
      const suffix = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      return hour12 + ' ' + suffix;
    }

    function formatTimeLabel(date) {
      return new Date(date).toLocaleTimeString('fr-CA', { hour: 'numeric', minute: '2-digit' });
    }

    function formatStatusLabel(status) {
      const labels = {
        draft: 'brouillon',
        approved: 'approuvé',
        scheduled: 'planifié',
        posted: 'publié',
        failed: 'échec',
        rejected: 'refusé',
      };
      return labels[status] || status;
    }

    function renderCalendarEvent(post, hourStart, hourHeight, totalHeight) {
      const date = new Date(post.scheduledFor);
      const minutes = (date.getHours() - hourStart) * 60 + date.getMinutes();
      const minBlock = 44;
      const top = Math.max(0, (minutes / 60) * hourHeight);
      const height = minBlock;
      const topic = escHtml(post.topic || 'Publication planifiée');
      const text = escHtml((post.text || '').slice(0, 88));

      if (top > totalHeight) return '';

      return '<div class="calendar-event" onclick="openPostFromCalendar(' + post.id + ')" style="top:' + Math.min(top, totalHeight - height) + 'px;height:' + height + 'px">' +
        '<div class="calendar-event-time">' + formatTimeLabel(date) + '</div>' +
        '<div class="calendar-event-title">' + topic + '</div>' +
        '<div class="calendar-event-meta">#' + post.id + ' · ' + text + '</div>' +
      '</div>';
    }

    function renderNowLine(weekStart, hourStart, hourEnd, hourHeight) {
      const now = new Date();
      const nowKey = formatDateKey(now);
      const days = Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(weekStart, index)));
      const dayIndex = days.indexOf(nowKey);
      if (dayIndex === -1) return '';
      if (now.getHours() < hourStart || now.getHours() >= hourEnd) return '';

      const top = ((now.getHours() - hourStart) * 60 + now.getMinutes()) / 60 * hourHeight;
      const left = 'calc(72px + ((100% - 72px) / 7) * ' + dayIndex + ')';
      const width = 'calc((100% - 72px) / 7)';
      return '<div class="calendar-now" style="top:' + top + 'px;left:' + left + ';width:' + width + '"></div>';
    }

    function updateCalendarRangeLabel(start, end) {
      const el = document.getElementById('calendar-range');
      if (!el) return;
      const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
      const startLabel = start.toLocaleDateString('fr-CA', { month: 'long', day: 'numeric' });
      const endLabel = end.toLocaleDateString('fr-CA', sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
      el.textContent = startLabel + ' au ' + endLabel;
    }

    function getScheduleDraft(postId, fallbackValue) {
      const current = scheduleEditorState[postId];
      const source = current?.value || fallbackValue || toDatetimeLocal(new Date().toISOString());
      const parts = source.split('T');
      return {
        date: parts[0] || '',
        time: parts[1] || '11:00',
      };
    }

    function renderScheduleEditor(postId, canReschedule, canSchedule, fallbackValue) {
      const state = scheduleEditorState[postId];
      if (!state?.open || (!canReschedule && !canSchedule)) return '';

      const draft = getScheduleDraft(postId, fallbackValue);
      const confirmLabel = canReschedule ? 'Confirmer la nouvelle heure' : 'Confirmer la planification';
      const mode = canReschedule ? 'reschedule' : 'schedule';

      return '<div class="schedule-editor">' +
        '<div class="schedule-editor-title">Choisis une date et une heure, puis confirme</div>' +
        '<div class="schedule-editor-fields">' +
          '<input class="datetime" type="date" id="schedule-date-' + postId + '" value="' + draft.date + '" onchange="updateScheduleDraft(' + postId + ')">' +
          '<input class="datetime" type="time" id="schedule-time-' + postId + '" value="' + draft.time + '" step="60" onchange="updateScheduleDraft(' + postId + ')">' +
        '</div>' +
        '<div class="schedule-editor-actions">' +
          '<button class="btn btn-schedule" onclick="confirmSchedule(' + postId + ', \\''
            + mode + '\\')">' + confirmLabel + '</button>' +
          '<button class="btn btn-reject" onclick="closeScheduleEditor(' + postId + ')">Annuler</button>' +
        '</div>' +
      '</div>';
    }

    function toggleScheduleEditor(postId, fallbackValue) {
      const current = scheduleEditorState[postId];
      if (current?.open) {
        delete scheduleEditorState[postId];
      } else {
        scheduleEditorState[postId] = { open: true, value: current?.value || fallbackValue || '' };
      }
      updateAutoRefreshBadge();
      loadPosts();
    }

    function closeScheduleEditor(postId) {
      delete scheduleEditorState[postId];
      updateAutoRefreshBadge();
      loadPosts();
    }

    function updateScheduleDraft(postId) {
      const dateInput = document.getElementById('schedule-date-' + postId);
      const timeInput = document.getElementById('schedule-time-' + postId);
      if (!dateInput || !timeInput) return;

      scheduleEditorState[postId] = {
        open: true,
        value: dateInput.value && timeInput.value ? dateInput.value + 'T' + timeInput.value : '',
      };
    }

    async function action(id, act) {
      await api('/api/posts/' + id + '/' + act, 'POST', act === 'schedule' ? { scheduledFor: null } : undefined);
      delete scheduleEditorState[id];
      loadAll();
    }

    async function confirmSchedule(id, mode) {
      updateScheduleDraft(id);
      const value = scheduleEditorState[id]?.value;
      if (!value) {
        alert('Choisis une date et une heure d’abord.');
        return;
      }

      await api('/api/posts/' + id + '/' + mode, 'POST', { scheduledFor: value });
      delete scheduleEditorState[id];
      loadAll();
    }

    async function spreadScheduled() {
      await api('/api/schedule/spread', 'POST');
      loadAll();
    }

    function hasOpenScheduleEditor() {
      return Object.values(scheduleEditorState).some((state) => state && state.open);
    }

    function updateAutoRefreshBadge() {
      const badge = document.getElementById('auto-refresh');
      if (!badge) return;
      badge.textContent = hasOpenScheduleEditor() ? 'Rafraîchissement auto : PAUSE' : 'Rafraîchissement auto : ACTIF';
    }

    function setActiveView(view) {
      activeView = view;
      document.getElementById('tab-posts').classList.toggle('active', view === 'posts');
      document.getElementById('tab-calendar').classList.toggle('active', view === 'calendar');
      document.getElementById('view-posts').classList.toggle('active', view === 'posts');
      document.getElementById('view-calendar').classList.toggle('active', view === 'calendar');
      if (view === 'calendar') loadCalendar();
      if (view === 'posts') loadPosts();
    }

    function changeCalendarWeek(offset) {
      currentWeekStart = addDays(currentWeekStart, offset * 7);
      if (activeView === 'calendar') loadCalendar();
    }

    function jumpToCurrentWeek() {
      currentWeekStart = getStartOfWeek(new Date());
      if (activeView === 'calendar') loadCalendar();
    }

    function openPostFromCalendar(postId) {
      setActiveView('posts');
      scheduleEditorState[postId] = scheduleEditorState[postId] || { open: true, value: '' };
      scheduleEditorState[postId].open = true;
      updateAutoRefreshBadge();
      loadPosts();
      setTimeout(() => {
        const target = document.getElementById('schedule-date-' + postId) || document.getElementById('posts');
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 30);
    }

    function loadAll() {
      updateAutoRefreshBadge();
      loadStats();
      if (activeView === 'calendar') {
        loadCalendar();
        return;
      }
      loadPosts();
    }
    loadAll();
    setInterval(() => {
      if (hasOpenScheduleEditor()) return;
      loadAll();
    }, 15000);
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
