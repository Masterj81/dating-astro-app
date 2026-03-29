import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 20;
const SECRET = Deno.env.get("SCHEDULED_EMAILS_SECRET") || "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth: service_role JWT or shared secret
  const authHeader = req.headers.get("authorization") || "";
  const secretHeader = req.headers.get("x-scheduled-emails-secret") || "";
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "NONE");
  const isValidSecret = SECRET && secretHeader === SECRET;

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

    const sendEmailUrl =
      Deno.env.get("SUPABASE_URL") + "/functions/v1/send-email";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Fetch pending emails that are due
    const { data: pendingEmails, error } = await supabase
      .from("scheduled_emails")
      .select("id, user_id, template, params")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(`Failed to query scheduled emails: ${error.message}`);
    }

    if (!pendingEmails?.length) {
      return new Response(
        JSON.stringify({ processed: 0, reason: "No pending emails" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[scheduled-emails] processing ${pendingEmails.length} emails`);

    let sent = 0;
    let failed = 0;

    for (const email of pendingEmails) {
      try {
        // Check if user still exists and hasn't unsubscribed
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", email.user_id)
          .single();

        if (!profile?.email) {
          await supabase
            .from("scheduled_emails")
            .update({ status: "cancelled", sent_at: new Date().toISOString() })
            .eq("id", email.id);
          continue;
        }

        // Call send-email function
        const response = await fetch(sendEmailUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            userId: email.user_id,
            template: email.template,
            params: email.params || {},
          }),
        });

        const result = await response.json();

        if (response.ok && (result.sent || result.skipped)) {
          await supabase
            .from("scheduled_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", email.id);
          sent++;
        } else {
          await supabase
            .from("scheduled_emails")
            .update({
              status: "failed",
              error: result.error || "Unknown error",
              sent_at: new Date().toISOString(),
            })
            .eq("id", email.id);
          failed++;
        }
      } catch (emailError) {
        console.error(`[scheduled-emails] error for ${email.id}:`, emailError);
        await supabase
          .from("scheduled_emails")
          .update({
            status: "failed",
            error: (emailError as Error).message,
            sent_at: new Date().toISOString(),
          })
          .eq("id", email.id);
        failed++;
      }
    }

    console.log(`[scheduled-emails] done: sent=${sent}, failed=${failed}`);

    return new Response(
      JSON.stringify({ processed: pendingEmails.length, sent, failed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[scheduled-emails] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
