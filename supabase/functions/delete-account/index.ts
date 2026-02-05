import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Verify the caller is authenticated via their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create a client with the user's JWT to verify identity
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use the service role client to delete the user
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete user — cascades to profiles, matches, messages, swipes, etc.
    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: "Failed to delete account" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Send deletion confirmation email via Resend
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
          subject: "Account Deleted — AstroDating",
          html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:12px;padding:40px;max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <span style="font-size:48px;">&#x1F44B;</span>
    <h1 style="color:#fff;font-size:22px;margin:12px 0 0;">Account Deleted</h1>
  </td></tr>
  <tr><td style="color:#c0c0c0;font-size:15px;line-height:1.6;padding-bottom:24px;">
    Your AstroDating account has been permanently deleted. All your data — profile, matches, messages, and birth chart — has been removed.
  </td></tr>
  <tr><td style="color:#c0c0c0;font-size:15px;line-height:1.6;padding-bottom:8px;">
    If you didn't request this, please contact us immediately at <a href="mailto:support@astrodatingapp.com" style="color:#a78bfa;">support@astrodatingapp.com</a>.
  </td></tr>
  <tr><td style="color:#555;font-size:12px;padding-top:32px;border-top:1px solid #2a2a40;">
    We're sorry to see you go. You can always create a new account if you change your mind.
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`,
        }),
      }).catch(() => {
        // Non-critical — account is already deleted
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
