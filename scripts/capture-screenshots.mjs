// scripts/capture-screenshots.mjs
// =============================================================================
// AstroDating — production marketing screenshots capturer
// =============================================================================
//
// Captures iPhone-sized screenshots of the deployed AstroDating web app, used
// on the marketing landing page (apps/web/public/screenshots/*.png).
//
// USAGE
// -----
// Bash (macOS / Linux / Git-Bash on Windows):
//   E2E_EMAIL=e2e_user1@example.com \
//   E2E_PASSWORD=TestPassword123! \
//   CAPTURE_ORIGIN=https://app.astrodatingapp.com \
//   node scripts/capture-screenshots.mjs
//
// PowerShell (Windows):
//   $env:E2E_EMAIL="e2e_user1@example.com"
//   $env:E2E_PASSWORD="TestPassword123!"
//   $env:CAPTURE_ORIGIN="https://app.astrodatingapp.com"
//   node scripts/capture-screenshots.mjs
//
// All env vars are optional and fall back to documented defaults.
//
// FILTERING WHICH SHOTS TO TAKE
// -----------------------------
// `CAPTURE_ONLY` and `CAPTURE_SKIP` accept comma-separated keys and let you
// run a subset of the 5 shots — useful when DB state has to flip between
// captures (e.g. unmatching to surface a profile in Discover, then
// re-matching to seed messages for Chat).
//
// Keys: discover | chat | compatibility | premium-cosmic | premium-celestial
//
//   CAPTURE_ONLY=discover node scripts/capture-screenshots.mjs
//   CAPTURE_SKIP=discover node scripts/capture-screenshots.mjs
//   CAPTURE_ONLY=chat,compatibility node scripts/capture-screenshots.mjs
//
// OUTPUT
// ------
// PNGs written to apps/web/public/screenshots/ at viewport 390x844 @ DPR 2
// (= 780x1688 physical px). Strict iPhone-15 ratio — DO NOT use fullPage,
// DO NOT change the viewport, DO NOT crop after capture.
//
// ANTI-PATTERNS
// -------------
//   - DO NOT modify any source file under apps/web/src/** to make capturing
//     easier. All in-page tweaks (hiding install banners, scrolling to a
//     compatibility arc, etc.) are injected from this script via DOM/CSS only.
//   - DO NOT add a hard-coded fallback account. If the primary login fails,
//     the script logs an explicit error and exits the relevant captures.
//   - DO NOT use page.screenshot({ fullPage: true }) — marketing assets must
//     match the iPhone viewport ratio.
//
// MASKING THE PWA INSTALL BANNER
// ------------------------------
// `apps/web/src/components/InstallPrompt.tsx` mounts an inline banner inside
// `AppShell` (region with aria-label="Install AstroDating") and may also
// render a sticky `StickyDownloadBar` on marketing pages. Both are hidden via
// `page.addStyleTag` after every navigation so they never leak into shots.
//
// COMPATIBILITY ARC
// -----------------
// `/en/app/matches` is dead in production (returns 307 to /app/chat — the
// "Matches" tab was removed in favor of conversation-first IA). The web
// profile page also does not render a compatibility component. The richest
// surface that DOES render a compatibility number on web is
// `/en/app/premium/celestial/synastry`, which shows a 32-px circle with the
// total %, the label "Cosmic compatibility", and four zone breakdown cards.
// `compatibility.png` therefore targets that route and scrolls the score
// circle into view before snapping.
// =============================================================================

import { chromium } from "playwright";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(REPO_ROOT, "apps/web/public/screenshots");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const ORIGIN = process.env.CAPTURE_ORIGIN || "https://app.astrodatingapp.com";
const CREDS = {
  email: process.env.E2E_EMAIL || "e2e_user1@example.com",
  password: process.env.E2E_PASSWORD || "TestPassword123!",
};

const SHOT_KEYS = ["discover", "chat", "compatibility", "premium-cosmic", "premium-celestial"];
const ONLY = (process.env.CAPTURE_ONLY || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const SKIP = (process.env.CAPTURE_SKIP || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const UNKNOWN_FILTER = [...ONLY, ...SKIP].filter((k) => !SHOT_KEYS.includes(k));
if (UNKNOWN_FILTER.length) {
  console.error(
    `[capture] unknown CAPTURE_ONLY/CAPTURE_SKIP key(s): ${UNKNOWN_FILTER.join(", ")}. ` +
      `Valid keys: ${SHOT_KEYS.join(", ")}`
  );
  process.exit(2);
}
function shouldRun(key) {
  if (ONLY.length && !ONLY.includes(key)) return false;
  if (SKIP.includes(key)) return false;
  return true;
}

const VIEWPORT = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// CSS injected after every navigation to neutralize marketing/PWA furniture
// that would otherwise pollute production-feel app screenshots.
//
// Selectors target stable structural hooks (no source edits required):
//   - role="region" + aria-label containing "Install"           → InstallPrompt
//   - aria-hidden + class containing "fixed inset-x-0 bottom-0" → StickyDownloadBar
//   - any leftover "Install AstroDating" / "Add to your home"    button rows
const HIDE_FURNITURE_CSS = `
  /* InstallPrompt (AppShell-mounted PWA banner) */
  [role="region"][aria-label*="Install" i],
  [role="region"][aria-label*="AstroDating" i] { display: none !important; }
  /* Defensive: any sticky bottom bar that could appear on app.* */
  .fixed.inset-x-0.bottom-0,
  [aria-hidden="false"].fixed.bottom-0,
  div[class*="md:hidden"][class*="fixed"][class*="bottom-0"] { display: none !important; }
  /* iOS install guide modal backdrop, if accidentally triggered */
  [data-component="ios-install-guide"],
  [aria-label="Install AstroDating"] { display: none !important; }
`;

const report = {
  origin: ORIGIN,
  loginEmail: CREDS.email,
  loginStatus: "pending",
  finalUrlAfterLogin: null,
  shots: [],
  notes: [],
};

function log(...args) {
  // eslint-disable-next-line no-console
  console.log("[capture]", ...args);
}

async function injectHideFurniture(page) {
  try {
    await page.addStyleTag({ content: HIDE_FURNITURE_CSS });
  } catch (err) {
    report.notes.push(`addStyleTag failed: ${String(err)}`);
  }
  // Belt & suspenders: also walk the DOM and force-hide nodes whose visible
  // text matches the install banner copy (covers translated labels we don't
  // anticipate via aria attributes).
  try {
    await page.evaluate(() => {
      const labels = ["install astrodating", "add to your home"];
      const all = document.querySelectorAll("div, section, aside");
      all.forEach((el) => {
        const txt = (el.textContent || "").trim().toLowerCase();
        if (!txt || txt.length > 200) return;
        if (labels.some((l) => txt.includes(l))) {
          el.style.setProperty("display", "none", "important");
        }
      });
    });
  } catch {
    // best-effort, ignore
  }
}

async function waitForLoadersGone(page) {
  // Wait for skeletons / pulses / role=status to disappear (best effort)
  try {
    await page.waitForFunction(
      () => {
        const pulses = document.querySelectorAll(".animate-pulse");
        const statuses = document.querySelectorAll('[role="status"]');
        return pulses.length === 0 && statuses.length === 0;
      },
      null,
      { timeout: 4000 }
    );
  } catch {
    // ignore — degraded but proceed
  }
}

async function settle(page, ms = 600) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(ms);
}

async function gotoStable(page, url, opts = {}) {
  log(`navigate -> ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 12000 });
  } catch {
    // ignore — networkidle can hang on long-poll endpoints
  }
  await waitForLoadersGone(page);
  await injectHideFurniture(page);
  if (opts.waitFor) {
    try {
      await page.waitForSelector(opts.waitFor, { timeout: 8000 });
    } catch {
      // ignore — capture whatever is there
    }
  }
  await settle(page);
  // Re-inject after settle in case React hydration re-mounted the banner.
  await injectHideFurniture(page);
}

async function attemptLogin(page, creds) {
  log(`login attempt: ${creds.email}`);
  await page.goto(`${ORIGIN}/en/auth/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 12000 });
  } catch {}
  await waitForLoadersGone(page);
  await injectHideFurniture(page);

  const emailInput = page.locator('input[type="email"]').first();
  const pwdInput = page.locator('input[type="password"]').first();
  const submitBtn = page.locator('button[type="submit"]').first();

  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(creds.email);
  await pwdInput.fill(creds.password);

  await Promise.all([
    page.waitForURL((u) => !u.toString().includes("/auth/login"), { timeout: 20000 }).catch(() => null),
    submitBtn.click(),
  ]);

  await page.waitForTimeout(2500);
  const url = page.url();
  if (url.includes("/auth/login")) {
    return { ok: false, url };
  }
  return { ok: true, url };
}

async function ensureLoggedIn(page) {
  // If the current URL is on /auth/login, retry login once. Used to recover
  // from session expiry between captures (e.g. JWT TTL hits 60min).
  if (!page.url().includes("/auth/login")) return true;
  log("session lost mid-run, retrying login");
  const res = await attemptLogin(page, CREDS).catch((e) => ({ ok: false, err: String(e) }));
  return Boolean(res.ok);
}

async function shoot(page, route, fileName, opts = {}) {
  const url = route.startsWith("http") ? route : `${ORIGIN}${route}`;
  await gotoStable(page, url, opts);

  // If the navigation bounced us back to login (session expired), retry once.
  if (page.url().includes("/auth/login")) {
    const recovered = await ensureLoggedIn(page);
    if (recovered) {
      await gotoStable(page, url, opts);
    } else {
      report.notes.push(`${fileName}: stayed on /auth/login after retry`);
    }
  }

  if (typeof opts.beforeShot === "function") {
    try {
      await opts.beforeShot(page);
    } catch (err) {
      report.notes.push(`${fileName}: beforeShot threw — ${String(err)}`);
    }
    // animations + lazy images
    await page.waitForTimeout(opts.beforeShotSettleMs ?? 1000);
    // Keep the banner hidden after any user-driven scroll.
    await injectHideFurniture(page);
  }

  const out = resolve(OUT_DIR, fileName);
  await page.screenshot({ path: out, type: "png" });
  const size = statSync(out).size;
  const finalUrl = page.url();
  report.shots.push({ file: out, route, finalUrl, bytes: size });
  log(`saved ${fileName} <- ${finalUrl} (${size} bytes)`);
  return { out, finalUrl };
}

// Scrolls the first element matching any of the given selectors into view-
// center, returns true if any matched.
async function scrollToFirst(page, selectors) {
  return await page.evaluate((sels) => {
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "instant" });
        return true;
      }
    }
    return false;
  }, selectors);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    isMobile: VIEWPORT.isMobile,
    hasTouch: VIEWPORT.hasTouch,
    userAgent: UA,
    locale: "en-US",
  });

  // Neutralize the client-side Fisher-Yates shuffle in DiscoverOverview.tsx:
  // forcing Math.random to ~1 makes every swap a no-op, so the deck order is
  // exactly what get_discoverable_profiles returns (Elliot at position 1
  // thanks to last_active DESC). No source edits required.
  await context.addInitScript(() => {
    // eslint-disable-next-line no-extend-native
    Math.random = () => 0.9999999999;
  });

  const page = await context.newPage();

  // Capture login screen first (always public, useful sanity check).
  try {
    await gotoStable(page, `${ORIGIN}/en/auth/login`, { waitFor: 'input[type="email"]' });
  } catch (e) {
    report.notes.push(`login page initial load issue: ${String(e)}`);
  }

  // Login (single account; no hard-coded fallback).
  const loginRes = await attemptLogin(page, CREDS).catch((e) => ({ ok: false, err: String(e) }));
  if (!loginRes.ok) {
    report.loginStatus = "failed";
    report.notes.push(
      `login failed for ${CREDS.email}; aborting authenticated captures. ` +
        `Provide working E2E_EMAIL / E2E_PASSWORD env vars and rerun.`
    );
    log("login FAILED — exiting");
    console.log("\n===== FINAL REPORT =====");
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(1);
  }

  report.loginStatus = "success";
  report.finalUrlAfterLogin = loginRes.url;
  log("login OK ->", loginRes.url);

  log("running shots:", SHOT_KEYS.filter(shouldRun).join(", ") || "(none)");

  // ---- Captures ----
  // 1) Discover
  let discoverProfileId = null;
  if (shouldRun("discover")) {
    try {
      await shoot(page, "/en/app/discover", "discover.png", { waitFor: "main" });
      try {
        discoverProfileId = await page.evaluate(() => {
          const a = Array.from(document.querySelectorAll('a[href*="/app/profile/"]'))[0];
          if (!a) return null;
          const m = a.getAttribute("href").match(/\/app\/profile\/([^/?#]+)/);
          return m ? m[1] : null;
        });
      } catch {}
    } catch (e) {
      report.notes.push(`discover.png error: ${String(e)}`);
    }
  } else {
    log("skip discover");
  }

  // 2) Chat — list view, then drill into the Elliot conversation specifically
  // (test account `e2e_user2` is renamed Elliot for marketing, see
  // docs/marketing/screenshot-seed-notes.md). Falls back to the first
  // conversation if Elliot's row isn't found.
  if (shouldRun("chat")) {
    try {
      await shoot(page, "/en/app/chat", "chat.png", { waitFor: "main" });
      const targetConvo = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll('a[href*="/app/chat/"]')
        ).filter((a) => a.getAttribute("href") !== "/en/app/chat");
        const elliot = links.find((a) => /elliot/i.test(a.textContent || ""));
        return (elliot || links[0])?.getAttribute("href") || null;
      });
      if (targetConvo) {
        await shoot(page, targetConvo, "chat.png", { waitFor: "main" });
      } else {
        report.notes.push("chat: no conversation found, kept list view");
      }
    } catch (e) {
      report.notes.push(`chat.png error: ${String(e)}`);
    }
  } else {
    log("skip chat");
  }

  // 3) Compatibility — synastry overview (the only authenticated web surface
  // that still renders a numeric compatibility score; `/en/app/matches` is
  // 307'd to /app/chat in production).
  if (shouldRun("compatibility")) {
    try {
      await shoot(page, "/en/app/premium/celestial/synastry", "compatibility.png", {
        waitFor: "main",
        beforeShot: async (p) => {
          // Strategy: scroll the synastry total-score circle into view.
          // The circle in SynastryOverview is a div with classes
          // `rounded-full border-4 border-accent` containing "XX%" — match by
          // structural shape rather than relying on Playwright-only selectors.
          const found = await scrollToFirst(p, [
            // The big total-score circle
            'div[class*="rounded-full"][class*="border-4"][class*="border-accent"]',
            // Any svg explicitly tagged as a compatibility image (covers the
            // CompatibilityDotsArc fallback if a future surface uses it)
            'svg[role="img"][aria-label*="ompat" i]',
            // Last resort: the breakdown grid title
            'main section div[class*="grid"][class*="md:grid-cols-2"]',
          ]);
          if (!found) {
            report.notes.push(
              "compatibility.png: no compat selector matched; falling back to mid-page scroll"
            );
            await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
          }
        },
        // dot-pop-in keyframes are ~700ms; let any progressive reveal settle.
        beforeShotSettleMs: 1100,
      });
    } catch (e) {
      report.notes.push(`compatibility.png error: ${String(e)}`);
    }
  } else {
    log("skip compatibility");
  }

  // 4) Premium Cosmic
  if (shouldRun("premium-cosmic")) {
    try {
      await shoot(page, "/en/app/premium/cosmic", "premium-cosmic.png", { waitFor: "main" });
    } catch (e) {
      report.notes.push(`premium-cosmic.png error: ${String(e)}`);
    }
  } else {
    log("skip premium-cosmic");
  }

  // 5) Premium Celestial
  if (shouldRun("premium-celestial")) {
    try {
      await shoot(page, "/en/app/premium/celestial", "premium-celestial.png", { waitFor: "main" });
    } catch (e) {
      report.notes.push(`premium-celestial.png error: ${String(e)}`);
    }
  } else {
    log("skip premium-celestial");
  }

  await browser.close();

  // eslint-disable-next-line no-console
  console.log("\n===== FINAL REPORT =====");
  console.log(JSON.stringify(report, null, 2));

  if (discoverProfileId) {
    log("discover surfaced profile id:", discoverProfileId);
  }
})();
