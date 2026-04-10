import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL =
  Deno.env.get("EMAIL_FROM") || "AstroDating <noreply@astrodatingapp.com>";
const SUPPORT_EMAIL = "support@astrodatingapp.com";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Auth: only allow service_role (called from DB trigger via pg_net)
    const authHeader = req.headers.get("authorization") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = serviceRoleKey.length > 0 && bearerToken === serviceRoleKey;

    if (!isServiceRole) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Missing RESEND_API_KEY" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const { reportId } = await req.json();

    if (!reportId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: reportId" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, reporter_id, reported_id, reason, description, status, created_at")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      return new Response(
        JSON.stringify({ error: "Report not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const [{ data: reporter }, { data: reported }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, email")
        .eq("id", report.reporter_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, name, email, bio")
        .eq("id", report.reported_id)
        .maybeSingle(),
    ]);

    const reporterLabel = reporter?.name || reporter?.email || report.reporter_id;
    const reportedLabel = reported?.name || reported?.email || report.reported_id;

    const text = [
      "A new AstroDating profile report was submitted.",
      "",
      `Report ID: ${report.id}`,
      `Created at: ${report.created_at}`,
      `Status: ${report.status ?? "pending"}`,
      `Reason: ${report.reason}`,
      "",
      `Reporter: ${reporterLabel}`,
      `Reporter ID: ${report.reporter_id}`,
      reporter?.email ? `Reporter email: ${reporter.email}` : null,
      "",
      `Reported user: ${reportedLabel}`,
      `Reported ID: ${report.reported_id}`,
      reported?.email ? `Reported email: ${reported.email}` : null,
      reported?.bio ? `Reported bio: ${reported.bio}` : null,
      "",
      "Description:",
      report.description || "(none)",
    ]
      .filter(Boolean)
      .join("\n");

    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [SUPPORT_EMAIL],
        reply_to: reporter?.email || undefined,
        subject: `[Report] ${report.reason} - ${reportedLabel}`,
        text,
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
