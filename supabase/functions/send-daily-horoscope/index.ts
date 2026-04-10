import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const SECRET = Deno.env.get("DAILY_HOROSCOPE_SECRET") || "";

const HOROSCOPE_TIPS: Record<string, string[]> = {
  aries: [
    "Bold energy today — take the lead in love.",
    "Your confidence is magnetic. Don't hold back.",
    "A spark of passion could ignite something new.",
    "Trust your instincts — they won't steer you wrong.",
    "Adventure calls. Say yes to something unexpected.",
  ],
  taurus: [
    "Slow and steady wins the heart today.",
    "Comfort is your superpower — share it with someone.",
    "A sensual surprise may be around the corner.",
    "Ground yourself before making romantic decisions.",
    "Loyalty shines through — someone notices.",
  ],
  gemini: [
    "Words are your weapon of charm today.",
    "A witty message could spark a real connection.",
    "Curiosity leads you to someone fascinating.",
    "Be present — your best conversations happen today.",
    "Double the fun — plan something social.",
  ],
  cancer: [
    "Your emotional depth attracts someone genuine.",
    "Home vibes are strong — a cozy date is ideal.",
    "Trust your feelings — they're guiding you right.",
    "Nurturing energy draws people closer.",
    "Vulnerability is strength today.",
  ],
  leo: [
    "All eyes on you — own the spotlight.",
    "Generosity in love brings unexpected rewards.",
    "Your warmth melts barriers today.",
    "Creative dates bring the most joy.",
    "Shine bright — your match is watching.",
  ],
  virgo: [
    "Details matter — a thoughtful gesture goes far.",
    "Your practical side is surprisingly romantic today.",
    "Health and love align — move your body.",
    "Organization leads to a perfect evening.",
    "Being helpful is your love language today.",
  ],
  libra: [
    "Harmony in relationships is your focus.",
    "Beauty surrounds you — share it with someone.",
    "Balance giving and receiving today.",
    "A fair compromise strengthens a bond.",
    "Your charm is irresistible — use it wisely.",
  ],
  scorpio: [
    "Intensity deepens a connection today.",
    "A secret admirer may reveal themselves.",
    "Transform a challenge into intimacy.",
    "Your magnetism is at a peak.",
    "Let someone in — the reward is worth the risk.",
  ],
  sagittarius: [
    "Freedom and love aren't opposites today.",
    "An adventurous date changes your perspective.",
    "Optimism is contagious — spread it.",
    "Honesty opens doors you didn't know existed.",
    "The journey matters more than the destination.",
  ],
  capricorn: [
    "Ambition and romance align today.",
    "Long-term thinking leads to the right match.",
    "Structure a plan — love rewards effort.",
    "Your dedication is deeply attractive.",
    "Patience pays off in matters of the heart.",
  ],
  aquarius: [
    "Your uniqueness is your greatest asset.",
    "An unconventional approach to love works today.",
    "Friendship deepens into something more.",
    "Innovation in dating brings surprising results.",
    "Be authentically you — the right person appreciates it.",
  ],
  pisces: [
    "Intuition guides you to the right person.",
    "A dream may hold a romantic message.",
    "Compassion creates deep connections today.",
    "Creative expression attracts your soulmate.",
    "Trust the flow — love finds you.",
  ],
};

function getDailyTip(sign: string): string {
  const tips = HOROSCOPE_TIPS[sign.toLowerCase()];
  if (!tips?.length) return "The stars have a message for you today.";
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return tips[dayOfYear % tips.length];
}

function getSignEmoji(sign: string): string {
  const emojis: Record<string, string> = {
    aries: "♈", taurus: "♉", gemini: "♊", cancer: "♋",
    leo: "♌", virgo: "♍", libra: "♎", scorpio: "♏",
    sagittarius: "♐", capricorn: "♑", aquarius: "♒", pisces: "♓",
  };
  return emojis[sign.toLowerCase()] || "✨";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth: either service_role JWT or shared secret header
  const authHeader = req.headers.get("authorization") || "";
  const secretHeader = req.headers.get("x-daily-horoscope-secret") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = serviceRoleKey.length > 0 && bearerToken === serviceRoleKey;
  const isValidSecret = SECRET.length > 0 && secretHeader === SECRET;

  if (!isServiceRole && !isValidSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch users with dailyHoroscope enabled and a push token
    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, push_token, sun_sign, notification_preferences")
      .not("push_token", "is", null)
      .not("sun_sign", "is", null);

    if (error) {
      throw new Error(`Failed to query profiles: ${error.message}`);
    }

    // Filter users who have dailyHoroscope preference enabled
    const eligibleUsers = (users || []).filter((u) => {
      const prefs = u.notification_preferences;
      return prefs?.dailyHoroscope === true;
    });

    console.log(`[daily-horoscope] ${eligibleUsers.length} eligible users out of ${users?.length || 0} with tokens`);

    if (eligibleUsers.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 0, reason: "No eligible users" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Send in batches via Expo Push API
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
      const batch = eligibleUsers.slice(i, i + BATCH_SIZE);

      const messages = batch.map((user) => {
        const sign = user.sun_sign?.toLowerCase() || "aries";
        const emoji = getSignEmoji(sign);
        const tip = getDailyTip(sign);
        const signCapitalized = sign.charAt(0).toUpperCase() + sign.slice(1);

        return {
          to: user.push_token,
          title: `${emoji} ${signCapitalized} — Daily Horoscope`,
          body: tip,
          data: { type: "dailyHoroscope", screen: "/(tabs)/premium" },
          sound: "default",
        };
      });

      try {
        const pushResponse = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(messages),
        });

        const result = await pushResponse.json();
        const tickets = result.data || [];

        for (const ticket of tickets) {
          if (ticket.status === "ok") {
            sent++;
          } else {
            failed++;
          }
        }
      } catch (batchError) {
        console.error(`[daily-horoscope] batch error:`, batchError);
        failed += batch.length;
      }
    }

    console.log(`[daily-horoscope] done: sent=${sent}, failed=${failed}`);

    return new Response(
      JSON.stringify({ sent, failed, total: eligibleUsers.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[daily-horoscope] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
