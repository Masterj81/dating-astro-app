import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// --- Rate limiting (in-memory) ---
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(userId, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return false;
}

const TYPE_TO_PREF_KEY: Record<string, string> = {
  like: "likes",
  message: "messages",
  dailyHoroscope: "dailyHoroscope",
  retrogradeAlert: "dailyHoroscope", // falls under horoscope prefs
  promotion: "promotions",
  // Legacy keys kept for backward compatibility
  messages: "messages",
  likes: "likes",
  promotions: "promotions",
};

// Map notification types to Android notification channels.
// Note: `notification_preferences.newMatches` JSON key is intentionally
// preserved on profiles (read by the mobile Settings "New connections"
// toggle) even though the matches notification type itself is retired
// (Phase A dropped the trigger that emitted type: "match").
const TYPE_TO_CHANNEL: Record<string, string> = {
  like: "matches",
  likes: "matches",
  message: "messages",
  messages: "messages",
  dailyHoroscope: "horoscope",
  retrogradeAlert: "horoscope",
  promotion: "default",
  promotions: "default",
};

// Errors from Expo that indicate the token is permanently invalid
const INVALID_TOKEN_ERRORS = [
  "DeviceNotRegistered",
  "InvalidCredentials",
];

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // --- Auth ---
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";

    // 401 before we even touch the body — no JWT, no service role, no notification.
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const isServiceRole =
      supabaseServiceKey.length > 0 && token === supabaseServiceKey;

    const { userId, type, title, body, data } = await req.json();

    if (!userId || typeof userId !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid userId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!type || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, title, body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // --- Authorization decision (P0-5):
    //   service_role  → may target any user (webhooks, crons, server code).
    //   user JWT      → may ONLY target themselves (user.id === userId).
    //   unauthorized  → already returned 401 above.
    //
    // Previously the JWT-vs-userId check was nested inside `if (!isServiceRole)`
    // only, which was correct but fragile: any refactor that skipped the branch
    // (e.g. treating a bad token as "likely service role") would silently open
    // cross-user targeting. We now validate both paths explicitly and reject
    // anything that falls through.
    if (!isServiceRole) {
      const userSupabase = createClient(supabaseUrl, supabaseAnonKey);
      const {
        data: { user },
        error: authError,
      } = await userSupabase.auth.getUser(token);

      if (authError || !user?.id) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      if (user.id !== userId) {
        console.warn(
          `[send-notification] cross-user targeting blocked: caller=${user.id} target=${userId}`
        );
        return new Response(
          JSON.stringify({ error: "Forbidden: cannot send notifications for another user" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // --- Input length validation ---
    if (typeof title !== "string" || title.length > 100) {
      return new Response(
        JSON.stringify({ error: "Title must be a string of at most 100 characters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (typeof body !== "string" || body.length > 500) {
      return new Response(
        JSON.stringify({ error: "Body must be a string of at most 500 characters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // --- Rate limiting ---
    if (isRateLimited(userId)) {
      return new Response(
        JSON.stringify({ error: "Too many notifications, try again later" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("push_token, notification_preferences")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      console.error(`[send-notification] Profile lookup failed for ${userId}:`, error?.message);
      return new Response(
        JSON.stringify({ skipped: true, reason: "Profile not found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check notification preference for this type BEFORE resolving tokens —
    // avoids a needless table read when the user has disabled this category.
    const prefKey = TYPE_TO_PREF_KEY[type];
    if (prefKey && profile.notification_preferences) {
      const prefs = profile.notification_preferences;
      if (prefs[prefKey] === false) {
        return new Response(
          JSON.stringify({ skipped: true, reason: `Notification type '${type}' disabled` }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // B1: resolve tokens from the multi-device push_tokens table first.
    // Each user can have N rows (one per device). Fall back to the legacy
    // profiles.push_token single-slot column only if push_tokens is empty.
    type TokenRow = { device_id: string; token: string };

    const tokenRows: TokenRow[] = [];
    const { data: pushTokenRows, error: pushTokenErr } = await supabase
      .from("push_tokens")
      .select("device_id, token")
      .eq("user_id", userId);

    if (pushTokenErr) {
      console.warn(
        `[send-notification] push_tokens lookup failed for ${userId}:`,
        pushTokenErr.message
      );
    } else if (pushTokenRows && pushTokenRows.length > 0) {
      for (const row of pushTokenRows) {
        if (row.token) tokenRows.push({ device_id: row.device_id, token: row.token });
      }
    }

    if (tokenRows.length === 0 && profile.push_token) {
      console.warn(
        `[send-notification] legacy fallback used for user_id=${userId} (no push_tokens row)`
      );
      tokenRows.push({ device_id: `legacy:${userId}`, token: profile.push_token });
    }

    if (tokenRows.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No push token" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build the data payload — always include `type` so the client can deep-link
    const pushData = { type, ...(data || {}) };

    // Resolve Android channel
    const channelId = TYPE_TO_CHANNEL[type] ?? "default";

    // Expo Push API accepts an array of messages in a single POST — one
    // message per (token, ...same payload). We batch all of this user's
    // devices into one request.
    const messages = tokenRows.map((row) => ({
      to: row.token,
      title,
      body,
      data: pushData,
      sound: "default",
      channelId,
      priority: "high",
    }));

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
    });

    const pushResult = await pushResponse.json();

    // Handle Expo push errors per-ticket (invalid/expired tokens).
    // Expo returns one ticket per message, in order, so we can map them back
    // to the originating token row.
    let sentCount = 0;
    let errorCount = 0;
    const invalidDeviceIds: string[] = [];
    const successfulDeviceIds: string[] = [];

    if (pushResult?.data) {
      const tickets = Array.isArray(pushResult.data) ? pushResult.data : [pushResult.data];
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const row = tokenRows[i];
        if (!row) continue;

        if (ticket.status === "ok") {
          sentCount++;
          successfulDeviceIds.push(row.device_id);
          continue;
        }

        if (ticket.status === "error") {
          errorCount++;
          console.error(
            `[send-notification] Expo push error for user ${userId} device ${row.device_id}: ${ticket.message} (${ticket.details?.error})`
          );

          if (ticket.details?.error && INVALID_TOKEN_ERRORS.includes(ticket.details.error)) {
            invalidDeviceIds.push(row.device_id);
          }
        }
      }
    }

    // Purge invalid tokens per device_id.
    // - For real device_ids, delete the row in push_tokens.
    // - For the synthetic `legacy:<userId>` row, null out profiles.push_token.
    for (const did of invalidDeviceIds) {
      if (did.startsWith("legacy:")) {
        const { error: clearErr } = await supabase
          .from("profiles")
          .update({ push_token: null })
          .eq("id", userId);
        if (clearErr) {
          console.error(
            `[send-notification] Failed to clear legacy push_token for ${userId}:`,
            clearErr.message
          );
        } else {
          console.warn(
            `[send-notification] Cleared invalid legacy push_token for user ${userId}`
          );
        }
      } else {
        const { error: delErr } = await supabase
          .from("push_tokens")
          .delete()
          .eq("device_id", did)
          .eq("user_id", userId);
        if (delErr) {
          console.error(
            `[send-notification] Failed to delete invalid push_tokens row device=${did}:`,
            delErr.message
          );
        } else {
          console.warn(
            `[send-notification] Deleted invalid push_tokens row user=${userId} device=${did}`
          );
        }
      }
    }

    // Bump last_seen_at for devices that successfully received the push —
    // lets a future cron prune zombie tokens by last_seen_at age.
    if (successfulDeviceIds.length > 0) {
      const realDeviceIds = successfulDeviceIds.filter((d) => !d.startsWith("legacy:"));
      if (realDeviceIds.length > 0) {
        const { error: bumpErr } = await supabase
          .from("push_tokens")
          .update({ last_seen_at: new Date().toISOString() })
          .in("device_id", realDeviceIds)
          .eq("user_id", userId);
        if (bumpErr) {
          console.warn(
            `[send-notification] last_seen_at bump failed for ${userId}:`,
            bumpErr.message
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentCount > 0,
        sent_count: sentCount,
        error_count: errorCount,
        total_devices: tokenRows.length,
        invalid_removed: invalidDeviceIds.length,
        result: pushResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-notification] Unhandled error:", (err as Error).message, (err as Error).stack);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
