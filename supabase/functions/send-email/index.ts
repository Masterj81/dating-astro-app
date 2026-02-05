import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("EMAIL_FROM") || "AstroDating <noreply@astrodatingapp.com>";

// ── Email templates ────────────────────────────────────────

function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Welcome to AstroDating ✨",
    html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:12px;padding:40px;max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <span style="font-size:48px;">&#x2728;</span>
    <h1 style="color:#fff;font-size:22px;margin:12px 0 0;">Welcome, ${name}!</h1>
  </td></tr>
  <tr><td style="color:#c0c0c0;font-size:15px;line-height:1.6;padding-bottom:24px;">
    Your account is verified and your birth chart is ready. The stars have aligned — time to discover your cosmic connections.
  </td></tr>
  <tr><td style="color:#c0c0c0;font-size:15px;line-height:1.6;padding-bottom:8px;">
    <strong style="color:#e94560;">&#x2764; Complete your profile</strong> — add photos and a bio so others can find you.<br/>
    <strong style="color:#c084fc;">&#x2B50; Start discovering</strong> — swipe through profiles matched by astrological compatibility.<br/>
    <strong style="color:#a78bfa;">&#x1F4AC; Say hello</strong> — when you match, break the ice with a message.
  </td></tr>
  <tr><td style="color:#555;font-size:12px;padding-top:32px;border-top:1px solid #2a2a40;">
    You're receiving this because you signed up for AstroDating. If this wasn't you, contact us at privacy@astrodatingapp.com.
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`,
  };
}

function newMatchEmail(
  name: string,
  matchedName: string,
  compatibility: number
): { subject: string; html: string } {
  return {
    subject: `You matched with ${matchedName}! 💫`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:12px;padding:40px;max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <span style="font-size:48px;">&#x1F496;</span>
    <h1 style="color:#fff;font-size:22px;margin:12px 0 0;">It's a Match!</h1>
  </td></tr>
  <tr><td style="color:#c0c0c0;font-size:15px;line-height:1.6;padding-bottom:24px;">
    Hey ${name}, you and <strong style="color:#e94560;">${matchedName}</strong> liked each other!
    Your astrological compatibility score is <strong style="color:#c084fc;">${compatibility}%</strong>.
  </td></tr>
  <tr><td style="color:#c0c0c0;font-size:15px;line-height:1.6;padding-bottom:8px;">
    Open the app to start chatting — the cosmos brought you together, now make the first move.
  </td></tr>
  <tr><td style="color:#555;font-size:12px;padding-top:32px;border-top:1px solid #2a2a40;">
    You can manage notification preferences in Settings &gt; Notifications.
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`,
  };
}

const TEMPLATES: Record<
  string,
  (params: Record<string, any>) => { subject: string; html: string }
> = {
  welcome: (p) => welcomeEmail(p.name),
  new_match: (p) => newMatchEmail(p.name, p.matchedName, p.compatibility),
};

// ── Handler ────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { userId, template, params } = await req.json();

    if (!userId || !template) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: userId, template" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const buildEmail = TEMPLATES[template];
    if (!buildEmail) {
      return new Response(
        JSON.stringify({ error: `Unknown template: ${template}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Look up the user's email and notification prefs
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, name, notification_preferences")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.email) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No email on profile" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Respect notification preferences for match emails
    if (template === "new_match") {
      const prefs = profile.notification_preferences;
      if (prefs?.newMatches === false) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "User disabled match emails" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const { subject, html } = buildEmail({ name: profile.name, ...params });

    // Send via Resend
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
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ sent: true, id: resendData.id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
