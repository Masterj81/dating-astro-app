import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL =
  Deno.env.get("EMAIL_FROM") || "AstroDating <noreply@astrodatingapp.com>";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailShell({
  eyebrow,
  title,
  intro,
  accentLabel,
  accentBody,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  accentLabel: string;
  accentBody: string;
  footer: string;
}) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background:#0b1020;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:radial-gradient(circle at top left,#2d1638 0%,#0b1020 46%,#070b16 100%);padding:32px 14px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#12182a;border:1px solid #2a3247;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
            <tr>
              <td style="padding:28px 32px 18px;background:linear-gradient(135deg,rgba(244,114,182,0.18),rgba(167,139,250,0.08));border-bottom:1px solid #2a3247;">
                <div style="display:inline-block;padding:9px 14px;border-radius:999px;border:1px solid #4b556f;color:#f8d4df;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;">
                  ${eyebrow}
                </div>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-0.03em;">
                  ${title}
                </h1>
                <p style="margin:0;color:#d4d9e7;font-size:16px;line-height:1.7;">
                  ${intro}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <div style="margin-bottom:22px;padding:18px 20px;border-radius:22px;background:linear-gradient(135deg,rgba(236,72,153,0.22),rgba(99,102,241,0.14));border:1px solid rgba(255,255,255,0.08);color:#ffffff;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.72);margin-bottom:8px;">
                    ${accentLabel}
                  </div>
                  ${accentBody}
                </div>
                <div style="color:#b7bfd3;font-size:14px;line-height:1.75;">
                  ${footer}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Welcome to AstroDating ✨",
    html: renderEmailShell({
      eyebrow: "AstroDating",
      title: `Welcome, ${name}!`,
      intro:
        "Your account is verified and your birth chart is ready. The stars have aligned. Time to discover your cosmic connections.",
      accentLabel: "First steps",
      accentBody: `
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Complete your profile</strong> with photos and a bio so the right people can actually recognize your energy.
        </p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Start discovering</strong> profiles ranked by astrological compatibility, not generic swiping noise.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Say hello</strong> when you match and turn chemistry into a real conversation.
        </p>
      `,
      footer:
        "You're receiving this because you created an AstroDating account. If this wasn't you, contact us at privacy@astrodatingapp.com.",
    }),
  };
}

function newMatchEmail(
  name: string,
  matchedName: string,
  compatibility: number,
): { subject: string; html: string } {
  return {
    subject: `You matched with ${matchedName}! 💫`,
    html: renderEmailShell({
      eyebrow: "New match",
      title: "It's a match",
      intro: `Hey ${name}, you and ${matchedName} liked each other. The cosmic pull is mutual.`,
      accentLabel: "Compatibility score",
      accentBody: `
        <p style="margin:0 0 10px;font-size:28px;font-weight:700;letter-spacing:-0.04em;color:#ffffff;">
          ${compatibility}%
        </p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#eef2ff;">
          Open the app to start chatting. The stars did their part. Now make the first move.
        </p>
      `,
      footer:
        "You can manage notification preferences in Settings > Notifications.",
    }),
  };
}

function onboardingDay1Email(name: string, sunSign: string): { subject: string; html: string } {
  const sign = sunSign || "your sign";
  return {
    subject: `Your ${sign} birth chart is ready 🪐`,
    html: renderEmailShell({
      eyebrow: "Your natal chart",
      title: `${name}, your chart is waiting`,
      intro:
        `Your full natal chart has been calculated. Discover your Sun, Moon, and Rising signs — and what they reveal about your personality, emotions, and how others see you.`,
      accentLabel: "What you'll discover",
      accentBody: `
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">☀️ Sun in ${sign}</strong> — your core identity and life force.
        </p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">🌙 Moon sign</strong> — your emotional world and inner needs.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">⬆️ Rising sign</strong> — how the world perceives you.
        </p>
      `,
      footer:
        'Open AstroDating to explore your full chart. You can manage email preferences in Settings > Notifications.',
    }),
  };
}

function onboardingDay3Email(name: string): { subject: string; html: string } {
  return {
    subject: `${name}, someone might be cosmically compatible with you 💫`,
    html: renderEmailShell({
      eyebrow: "Cosmic compatibility",
      title: "Your matches are waiting",
      intro:
        "We use real synastry — comparing planetary positions between two birth charts — to find people who are genuinely compatible with you. Not just sun signs, but the full picture.",
      accentLabel: "How it works",
      accentBody: `
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Real synastry</strong> — we analyze conjunctions, trines, squares, and oppositions across your charts.
        </p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Compatibility scores</strong> — see a percentage based on planetary aspects and house overlays.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Start swiping</strong> — profiles are ranked by cosmic compatibility, not random chance.
        </p>
      `,
      footer:
        'Open AstroDating to discover your most compatible matches. You can manage email preferences in Settings > Notifications.',
    }),
  };
}

function onboardingDay5Email(name: string): { subject: string; html: string } {
  return {
    subject: `${name}, your free trial ends in 2 days ⏳`,
    html: renderEmailShell({
      eyebrow: "Trial reminder",
      title: "2 days left in your trial",
      intro:
        "Your 7-day free trial is almost over. Make the most of it — explore all the premium features before they lock.",
      accentLabel: "What you'll lose access to",
      accentBody: `
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Full natal chart</strong> — planets, houses, and aspects.
        </p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Advanced synastry</strong> — deep compatibility analysis with your matches.
        </p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Daily horoscope</strong> — personalized cosmic guidance every morning.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Unlimited likes & super likes</strong> — connect without limits.
        </p>
      `,
      footer:
        'Open AstroDating to keep your premium access. Cancel anytime if it\'s not for you — no hard feelings. You can manage email preferences in Settings > Notifications.',
    }),
  };
}

const TEMPLATES: Record<
  string,
  (params: Record<string, unknown>) => { subject: string; html: string }
> = {
  welcome: (params) => welcomeEmail(String(params.name ?? "")),
  new_match: (params) =>
    newMatchEmail(
      String(params.name ?? ""),
      String(params.matchedName ?? "someone"),
      Number(params.compatibility ?? 0),
    ),
  onboarding_day1: (params) =>
    onboardingDay1Email(
      String(params.name ?? ""),
      String(params.sunSign ?? ""),
    ),
  onboarding_day3: (params) =>
    onboardingDay3Email(String(params.name ?? "")),
  onboarding_day5: (params) =>
    onboardingDay5Email(String(params.name ?? "")),
};

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

    const buildEmail = TEMPLATES[template];
    if (!buildEmail) {
      return new Response(
        JSON.stringify({ error: `Unknown template: ${template}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, name, notification_preferences")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.email) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No email on profile" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (template === "new_match") {
      const prefs = profile.notification_preferences;
      if (prefs?.newMatches === false) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "User disabled match emails" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // HTML-escape user-provided params to prevent XSS in emails
    const safeParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      safeParams[key] = typeof value === "string" ? escapeHtml(value) : value;
    }
    const safeName = profile.name ? escapeHtml(String(profile.name)) : "";

    const { subject, html } = buildEmail({ name: safeName, ...safeParams });

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
