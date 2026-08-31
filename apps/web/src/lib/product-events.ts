// Minimal product analytics client.
//
// Writes go through the `record_product_event` RPC, never straight to the
// table — `product_events` has RLS on and no policies, so a direct insert is
// denied by design (migration 20260831000001). The RPC whitelists the event
// name and template and strips anything that could carry a token.
//
// Best effort, exactly like `PreferredLanguageSync` and `web-activity`: every
// failure path is swallowed. A missing beacon is a missing data point, never a
// broken page.
//
// ---------------------------------------------------------------------------
// WHY ATTRIBUTION OUTLIVES THE PAGE
// ---------------------------------------------------------------------------
// A lifecycle email opens in a mail app, which hands the link to a browser
// that usually has no session. The real journey is:
//
//   land on /app/…?template=onboarding_day1   ← click recorded, user_id NULL
//   AppShell sees no session
//     → router.replace('/auth/login?next=/app/…')      ← `template` is GONE:
//                                                         AppShell.tsx builds
//                                                         `next` from the
//                                                         pathname only
//   reader signs in
//     → back to /app/…                                  ← still no `template`
//
// So an in-page `onAuthStateChange` listener is not enough: by the time
// identity exists, the URL that named the template is two navigations behind.
// Everything joining clicks to profiles — clicked → active, clicked → saw
// their chart, clicked → returned on day 1 — would still have come back empty.
//
// The pending attribution is therefore parked in `sessionStorage`, which
// survives same-tab navigation, and replayed from ANY page once a session
// appears. `client_event_id` makes that replay an upgrade of the original row
// rather than a second one (migration 20260831000002).
//
// sessionStorage and not localStorage on purpose: the scope is "this visit".
// A reader who finishes signing in days later, or in another tab, simply keeps
// an anonymous click — which is still an honest row, not a wrong one.

import { getSupabaseBrowser } from "@/lib/supabase-browser";

/**
 * Templates the lifecycle mailer can send. Must stay in sync with `c_templates`
 * in the RPC and with TEMPLATES in supabase/functions/send-email/templates.ts —
 * the RPC drops anything it does not recognise, so a drift here shows up as
 * silence rather than an error.
 */
const KNOWN_TEMPLATES = new Set([
  "welcome",
  "onboarding_day1",
  "onboarding_day3",
  "onboarding_day5",
]);

const PENDING_KEY = "juno.emailclick.pending";

type PendingClick = {
  template: string;
  id: string;
  utmSource: string | null;
  utmCampaign: string | null;
  path: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Pre-2021 Safari. Not cryptographically meaningful — this id only has to be
  // unique enough not to collide with another browser session.
  const rand = () => Math.random().toString(16).slice(2, 10);
  return `${rand()}${rand().slice(0, 4)}-${rand().slice(0, 4)}-4${rand().slice(0, 3)}-8${rand().slice(0, 3)}-${rand()}${rand().slice(0, 4)}`;
}

function readPending(): PendingClick | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingClick;
    return parsed && KNOWN_TEMPLATES.has(parsed.template) && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

function writePending(pending: PendingClick): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* private mode — the click is still recorded, it just cannot be upgraded */
  }
}

function clearPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}

async function send(pending: PendingClick): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.rpc("record_product_event", {
    p_event_name: "email_clicked",
    p_template: pending.template,
    p_utm_source: pending.utmSource,
    p_utm_campaign: pending.utmCampaign,
    // Pathname only. The RPC strips a query string too, but not sending one is
    // the actual guarantee: the unsubscribe flow signs an HMAC into its URL and
    // it must never reach an analytics row.
    p_path: pending.path,
    p_platform: "web",
    p_client_event_id: pending.id,
  });
  return !error;
}

/**
 * Record that this page load came from a lifecycle email.
 *
 * Returns immediately unless the URL carries a recognised `template`, which is
 * the overwhelmingly common case — this runs on every navigation.
 */
export async function recordEmailClick(search: string, pathname: string): Promise<void> {
  try {
    const params = new URLSearchParams(search);
    const template = params.get("template");
    if (!template || !KNOWN_TEMPLATES.has(template)) return;

    // Reuse the id if this same template is already pending in this tab, so a
    // re-render or a back-navigation upgrades the row instead of adding one.
    const existing = readPending();
    const pending: PendingClick = {
      template,
      id: existing?.template === template ? existing.id : newId(),
      utmSource: params.get("utm_source"),
      utmCampaign: params.get("utm_campaign"),
      path: pathname,
    };

    // Park it BEFORE sending: the sign-in redirect can happen while the RPC is
    // still in flight, and the pending entry is what survives it.
    writePending(pending);

    const ok = await send(pending);
    if (ok) await attributePendingClick();
  } catch {
    /* best effort — never surface to the reader */
  }
}

/**
 * Attach a click recorded earlier in this visit to the reader who has now
 * signed in, then stop trying.
 *
 * Safe and cheap to call from any page: it returns immediately when nothing is
 * pending, and when there is still no session.
 */
export async function attributePendingClick(): Promise<void> {
  try {
    const pending = readPending();
    if (!pending) return;

    const supabase = getSupabaseBrowser();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // No session yet: keep the entry parked. This is the normal state between
    // the landing and the end of the sign-in flow.
    if (!session?.user?.id) return;

    // Same id, so the RPC upgrades the original row rather than inserting a
    // second one. `created_at` stays the moment of the CLICK, which is what
    // the "clicked → active" query compares against.
    if (await send(pending)) clearPending();
  } catch {
    /* best effort — never surface to the reader */
  }
}
