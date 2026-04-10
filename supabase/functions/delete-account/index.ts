import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: "Failed to delete account" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("EMAIL_FROM") || "AstroDating <noreply@astrodatingapp.com>";

    if (resendKey && user.email) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [user.email],
          subject: "Account Deleted - AstroDating",
          html: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  </head>
  <body style="margin:0;padding:0;background:#0b1020;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:radial-gradient(circle at top left,#2d1638 0%,#0b1020 46%,#070b16 100%);padding:32px 14px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#12182a;border:1px solid #2a3247;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
            <tr>
              <td style="padding:28px 32px 18px;background:linear-gradient(135deg,rgba(244,114,182,0.18),rgba(167,139,250,0.08));border-bottom:1px solid #2a3247;">
                <div style="display:inline-block;padding:9px 14px;border-radius:999px;border:1px solid #4b556f;color:#f8d4df;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;">
                  Account update
                </div>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-0.03em;">
                  Account deleted
                </h1>
                <p style="margin:0;color:#d4d9e7;font-size:16px;line-height:1.7;">
                  Your AstroDating account has been permanently deleted. Your profile, matches, messages, and birth chart data have been removed.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <div style="margin-bottom:22px;padding:18px 20px;border-radius:22px;background:linear-gradient(135deg,rgba(248,113,113,0.18),rgba(190,24,93,0.14));border:1px solid rgba(255,255,255,0.08);color:#ffffff;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.72);margin-bottom:8px;">
                    Important
                  </div>
                  <p style="margin:0;font-size:15px;line-height:1.75;color:#fee2e2;">
                    If you did not request this action, contact <a href="mailto:support@astrodatingapp.com" style="color:#f9a8d4;">support@astrodatingapp.com</a> immediately.
                  </p>
                </div>
                <div style="color:#b7bfd3;font-size:14px;line-height:1.75;">
                  We're sorry to see you go. You can always create a new account later if you change your mind.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
        }),
      }).catch(() => {
        // Non-critical - account is already deleted
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error('Error deleting account:', (err as Error).message);
    return new Response(
      JSON.stringify({ error: "Something went wrong" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
