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
// IDEMPOTENCY LIVES IN THE DATABASE, NOT HERE.
// The first version guarded with a sessionStorage boolean, which was wrong in
// the case that matters most: people open lifecycle email in a mail app, land
// in a browser with no session, and only sign in afterwards. The click was
// recorded anonymously, the boolean then blocked every retry, and `user_id`
// stayed NULL for the majority of real clicks — leaving every query that joins
// clicks to profiles permanently empty.
//
// So each (template, browser session) mints one `client_event_id` instead. The
// first call inserts; a later call, fired once auth resolves, hits the same id
// and upgrades the row in place (migration 20260831000002). Calling twice is
// safe and expected.

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

function storageKey(template: string): string {
  return `juno.emailclick.${template}`;
}

/**
 * The id for this (template, browser session). Stable across the anonymous
 * write and the later attributed one, which is what lets the RPC upgrade a row
 * instead of duplicating it.
 *
 * Falls back to a fresh id when storage is unavailable (private mode): the
 * click is still recorded, it just cannot be upgraded later. A duplicate row is
 * survivable; a thrown exception on a page render is not.
 */
function clientEventId(template: string): string {
  const fresh = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : // Pre-2021 Safari. Not cryptographically meaningful — this id only has
        // to be unique enough not to collide with another browser session.
        `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-4000-8000-${Math.random()
          .toString(16)
          .slice(2, 14)}`;

  try {
    const existing = sessionStorage.getItem(storageKey(template));
    if (existing) return existing;
    const id = fresh();
    sessionStorage.setItem(storageKey(template), id);
    return id;
  } catch {
    return fresh();
  }
}

/**
 * Record that this page load came from a lifecycle email, or attribute an
 * already-recorded click now that the reader has signed in.
 *
 * Safe and cheap to call repeatedly: it returns immediately unless the URL
 * carries a recognised `template`, and the RPC is idempotent on the id.
 */
export async function recordEmailClick(search: string, pathname: string): Promise<void> {
  try {
    const params = new URLSearchParams(search);
    const template = params.get("template");

    if (!template || !KNOWN_TEMPLATES.has(template)) return;

    const supabase = getSupabaseBrowser();
    await supabase.rpc("record_product_event", {
      p_event_name: "email_clicked",
      p_template: template,
      p_utm_source: params.get("utm_source"),
      p_utm_campaign: params.get("utm_campaign"),
      // Pathname only. The RPC strips a query string too, but not sending one
      // is the actual guarantee: the unsubscribe flow signs an HMAC into its
      // URL and it must never reach an analytics row.
      p_path: pathname,
      p_platform: "web",
      p_client_event_id: clientEventId(template),
    });
  } catch {
    /* best effort — never surface to the reader */
  }
}
