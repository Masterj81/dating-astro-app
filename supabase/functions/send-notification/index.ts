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
  match: "newMatches",
  like: "likes",
  superLike: "superLikes",
  message: "messages",
  dailyHoroscope: "dailyHoroscope",
  retrogradeAlert: "dailyHoroscope", // falls under horoscope prefs
  promotion: "promotions",
  // Legacy keys kept for backward compatibility
  newMatches: "newMatches",
  messages: "messages",
  likes: "likes",
  superLikes: "superLikes",
  promotions: "promotions",
};

// Map notification types to Android notification channels
const TYPE_TO_CHANNEL: Record<string, string> = {
  match: "matches",
  like: "matches",
  superLike: "matches",
  newMatches: "matches",
  likes: "matches",
  superLikes: "matches",
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

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing auth token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const isServiceRole = supabaseServiceKey.length > 0 && token === supabaseServiceKey;

    const { userId, type, title, body, data } = await req.json();

    if (!userId || !type || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: userId, type, title, body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
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
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      if (user.id !== userId) {
        return new Response(
          JSON.stringify({ error: "Forbidden: userId mismatch" }),
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

    // No push token registered
    if (!profile.push_token) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No push token" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check notification preference for this type
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

    // Build the data payload — always include `type` so the client can deep-link
    const pushData = { type, ...(data || {}) };

    // Resolve Android channel
    const channelId = TYPE_TO_CHANNEL[type] ?? "default";

    // Send via Expo Push API
    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: profile.push_token,
        title,
        body,
        data: pushData,
        sound: "default",
        channelId,
        priority: "high",
      }),
    });

    const pushResult = await pushResponse.json();

    // Handle Expo push errors (invalid/expired tokens)
    if (pushResult?.data) {
      const tickets = Array.isArray(pushResult.data) ? pushResult.data : [pushResult.data];
      for (const ticket of tickets) {
        if (ticket.status === "error") {
          console.error(
            `[send-notification] Expo push error for user ${userId}: ${ticket.message} (${ticket.details?.error})`
          );

          // If the token is permanently invalid, clear it from the profile
          if (ticket.details?.error && INVALID_TOKEN_ERRORS.includes(ticket.details.error)) {
            console.warn(
              `[send-notification] Clearing invalid push token for user ${userId} (${ticket.details.error})`
            );
            const { error: clearError } = await supabase
              .from("profiles")
              .update({ push_token: null })
              .eq("id", userId);

            if (clearError) {
              console.error(
                `[send-notification] Failed to clear invalid token for ${userId}:`,
                clearError.message
              );
            }

            return new Response(
              JSON.stringify({
                sent: false,
                reason: "Token invalid, cleared from profile",
                error: ticket.details.error,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ sent: true, result: pushResult }),
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
