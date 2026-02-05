import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const TYPE_TO_PREF_KEY: Record<string, string> = {
  newMatches: "newMatches",
  messages: "messages",
  likes: "likes",
  superLikes: "superLikes",
  dailyHoroscope: "dailyHoroscope",
  promotions: "promotions",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { userId, type, title, body, data } = await req.json();

    if (!userId || !type || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: userId, type, title, body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("push_token, notification_preferences")
      .eq("id", userId)
      .single();

    if (error || !profile) {
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
        data: data || {},
        sound: "default",
      }),
    });

    const pushResult = await pushResponse.json();

    return new Response(
      JSON.stringify({ sent: true, result: pushResult }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
