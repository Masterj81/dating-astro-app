import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isSuppressed,
  TEMPLATES,
  type TemplateContext,
} from "./templates.ts";

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
// Same construction as supabase/functions/cancel-account-deletion: an HMAC over
// `userId:category`, base64url payload + "." + signature. Verified by the
// companion `unsubscribe` function.
//
// Deliberately NEVER expires. An unsubscribe link that has gone stale is a
// compliance failure, not a security improvement. The token grants exactly one
// capability — flipping one boolean on one profile — so replay is harmless.
//
// The secret falls back to a value derived from the service-role key so the
// feature works on first deploy with nothing to provision. Set
// UNSUBSCRIBE_TOKEN_SECRET to rotate it independently.
const UNSUBSCRIBE_TOKEN_SECRET =
  Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ||
  (supabaseServiceKey ? `juno-unsubscribe-v1:${supabaseServiceKey}` : "");

function b64UrlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function buildUnsubscribeUrl(
  userId: string,
  category: string,
): Promise<string | null> {
  if (!UNSUBSCRIBE_TOKEN_SECRET || !supabaseUrl) return null;
  const payload = `${userId}:${category}`;
  const sig = await hmac(payload, UNSUBSCRIBE_TOKEN_SECRET);
  const token = `${b64UrlEncode(payload)}.${sig}`;
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
      .select("email, name, notification_preferences, sun_sign, moon_sign")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.email) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No email on profile" }),
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

    const unsubscribeUrl = await buildUnsubscribeUrl(userId, "lifecycle");

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
