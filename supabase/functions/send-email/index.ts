import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isSuppressed,
  TEMPLATES,
  type TemplateContext,
} from "./templates.ts";
import {
  describeKeyring,
  readUnsubscribeKeyring,
  signUnsubscribeToken,
  UNSUBSCRIBE_CATEGORY,
} from "../_shared/unsubscribe-token.ts";

// JUNO lifecycle + transactional email.
//
// P0-1 of docs/retention-day2-audit-2026-08.md. Before this patch every
// template rendered without a single <a href>: the copy read "Open JUNO to
// explore your full chart" as plain text, so no email could ever bring anybody
// back. The footer promised email preferences that were read from the database
// and then ignored, and the day-5 template announced the imminent expiry of a
// promotional period that does not exist anywhere in the backend.
//
// What this file now guarantees:
//   * every template carries a real, tracked CTA to app.junosynastry.com;
//   * every message ships a text/plain alternative alongside the HTML;
//   * lifecycle mail is genuinely suppressible — checked here before Resend is
//     ever called, and one-click unsubscribable per RFC 8058;
//   * transactional mail is never suppressible, because losing it would lock
//     people out of their own account.
//
// Copy and rendering live in ./templates.ts, which imports nothing, so the
// templates can be rendered and asserted on outside Deno. See
// scripts/validate-email-templates.mjs.

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL =
  Deno.env.get("EMAIL_FROM") || "JUNO <noreply@junosynastry.com>";

// ---------------------------------------------------------------------------
// Unsubscribe tokens
// ---------------------------------------------------------------------------
// Signing lives in ../_shared/unsubscribe-token.ts, which is also what the
// companion `unsubscribe` function verifies with. Read its header before
// changing anything here.
//
// Deliberately NEVER expires. An unsubscribe link that has gone stale is a
// compliance failure, not a security improvement. The token grants exactly one
// capability — flipping one boolean on one profile — so replay is harmless.
//
// JUNO-21: this used to fall back to `juno-unsubscribe-v1:${serviceRoleKey}`,
// which chained every unsubscribe link ever sent to the lifetime of the most
// privileged credential in the system. There is no fallback now. This function
// signs v2 tokens and nothing else — the legacy key exists only in
// `unsubscribe`, only to VERIFY links already in people's inboxes.
const ENV = Deno.env.toObject();
const UNSUBSCRIBE_KEYRING = readUnsubscribeKeyring(ENV);

// One line at cold start. Names and presence only, never values — and it is
// the only place that warns about a half-finished key migration.
console.log(`[send-email] unsubscribe keys: ${describeKeyring(ENV)}`);

async function buildUnsubscribeUrl(
  userId: string,
  category: string,
): Promise<string | null> {
  if (!supabaseUrl) return null;
  const token = await signUnsubscribeToken(userId, category, UNSUBSCRIBE_KEYRING);
  if (!token) return null;
  return `${supabaseUrl}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // --- Auth ---
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing auth token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const isServiceRole = supabaseServiceKey.length > 0 && token === supabaseServiceKey;

    const { userId, template, params } = await req.json();

    if (!userId || !template) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: userId, template" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!isServiceRole) {
      const userSupabase = createClient(supabaseUrl, supabaseAnonKey);
      const {
        data: { user },
        error: authError,
      } = await userSupabase.auth.getUser(token);

      if (authError || !user?.id) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      if (user.id !== userId) {
        return new Response(
          JSON.stringify({ error: "Forbidden: userId mismatch" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    const entry = TEMPLATES[template];
    if (!entry) {
      return new Response(
        JSON.stringify({ error: `Unknown template: ${template}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // sun_sign / moon_sign are read here rather than trusted from `params`:
    // the scheduling trigger only carries sunSign, snapshotted at onboarding
    // time. The profile is the fresher source, and it is the only place the
    // Moon exists at all — which is what lets the D+1 email say something the
    // reader has not already seen on screen.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, name, notification_preferences, sun_sign, moon_sign, is_active")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.email) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No email on profile" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // A deactivated account gets no mail at all, transactional included: the
    // account is not in use, and lifecycle mail queued days earlier (day5 is
    // 120 hours out) can easily outlive the deactivation that happened in
    // between. The scheduling trigger checks this too, but only at enqueue
    // time — this is the check that holds for the whole window.
    if (profile.is_active === false) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "inactive" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Honour the opt-out BEFORE calling Resend. The previous version selected
    // notification_preferences and never looked at it, while the footer told
    // the reader they could manage their preferences.
    if (isSuppressed(profile.notification_preferences, entry.category)) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "unsubscribed" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const unsubscribeUrl = await buildUnsubscribeUrl(userId, UNSUBSCRIBE_CATEGORY);

    // HTML-escape anything that reaches a template. Signs additionally pass
    // through a lookup table in templates.ts, so they can never carry markup.
    const safeParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      safeParams[key] = typeof value === "string" ? escapeHtml(value) : value;
    }
    const safeName = profile.name ? escapeHtml(String(profile.name)) : "";

    const ctx: TemplateContext = {
      name: safeName,
      sunSign: String(profile.sun_sign ?? safeParams.sunSign ?? ""),
      moonSign: String(profile.moon_sign ?? ""),
      unsubscribeUrl,
    };

    const { subject, html, text } = entry.build(ctx);

    // RFC 8058 one-click unsubscribe. Gmail and Yahoo require this of bulk
    // senders; without it, lifecycle mail is materially likelier to land in
    // spam however good the copy is. Transactional mail must NOT carry these.
    const headers: Record<string, string> = {};
    if (entry.category === "lifecycle" && unsubscribeUrl) {
      headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [profile.email],
        subject,
        html,
        text,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return new Response(
        JSON.stringify({ error: "Resend API error", details: resendData }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ sent: true, id: resendData.id }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
