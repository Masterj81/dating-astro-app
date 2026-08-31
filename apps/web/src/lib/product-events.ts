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

/** One beacon per template per browser session. */
function alreadyRecorded(template: string): boolean {
  try {
    return sessionStorage.getItem(`juno.emailclick.${template}`) === "1";
  } catch {
    // Private mode / storage disabled. Fall through and record: a duplicate
    // row is harmless and countable with DISTINCT; a thrown exception is not.
    return false;
  }
}

function remember(template: string): void {
  try {
    sessionStorage.setItem(`juno.emailclick.${template}`, "1");
  } catch {
    /* storage unavailable — we may record twice, which the queries tolerate */
  }
}

/**
 * Record that this page load came from a lifecycle email.
 *
 * Returns silently when the URL carries no recognised `template`, which is the
 * overwhelmingly common case — this runs on every navigation.
 */
export async function recordEmailClick(search: string, pathname: string): Promise<void> {
  try {
    const params = new URLSearchParams(search);
    const template = params.get("template");

    if (!template || !KNOWN_TEMPLATES.has(template)) return;
    if (alreadyRecorded(template)) return;

    // Claim the slot before awaiting: React can mount an effect twice in
    // development, and both would otherwise pass the check above.
    remember(template);

    const supabase = getSupabaseBrowser();
    const { error } = await supabase.rpc("record_product_event", {
      p_event_name: "email_clicked",
      p_template: template,
      p_utm_source: params.get("utm_source"),
      p_utm_campaign: params.get("utm_campaign"),
      // Pathname only. The RPC strips a query string too, but not sending one
      // is the actual guarantee: the unsubscribe flow signs an HMAC into its
      // URL and it must never reach an analytics row.
      p_path: pathname,
      p_platform: "web",
    });

    if (error) {
      // Release the slot so a later navigation can retry rather than treating
      // a transient failure as "already recorded".
      try {
        sessionStorage.removeItem(`juno.emailclick.${template}`);
      } catch {
        /* nothing to release */
      }
    }
  } catch {
    /* best effort — never surface to the reader */
  }
}
