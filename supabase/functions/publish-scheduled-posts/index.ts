import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BLOTATO_API_URL = "https://api.blotato.com/v1/posts";
const SECRET = Deno.env.get("SCHEDULED_POSTS_SECRET") || "";
const BLOTATO_KEY = Deno.env.get("BLOTATO_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth: shared secret header
  const secretHeader = req.headers.get("x-scheduled-posts-secret") || "";
  const authHeader = req.headers.get("authorization") || "";
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "NONE");
  const isValidSecret = SECRET && secretHeader === SECRET;

  if (!isServiceRole && !isValidSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!BLOTATO_KEY) {
      return new Response(
        JSON.stringify({ error: "BLOTATO_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch scheduled posts that are due
    const now = new Date().toISOString();
    const { data: posts, error: fetchError } = await supabase
      .from("marketing_posts")
      .select("id, text, platforms, image_url")
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(5);

    if (fetchError) {
      throw new Error(`Failed to fetch posts: ${fetchError.message}`);
    }

    if (!posts?.length) {
      return new Response(
        JSON.stringify({ processed: 0, reason: "No posts due" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[publish-scheduled-posts] ${posts.length} posts due`);

    let posted = 0;
    let failed = 0;

    for (const post of posts) {
      try {
        const body: Record<string, unknown> = {
          content: post.text,
          platforms: post.platforms,
        };

        if (post.image_url) {
          body.media = [{ type: "image", url: post.image_url }];
        }

        const blotResponse = await fetch(BLOTATO_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${BLOTATO_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (blotResponse.ok) {
          const blotData = await blotResponse.json();
          await supabase
            .from("marketing_posts")
            .update({
              status: "posted",
              posted_at: new Date().toISOString(),
              blotato_post_id: blotData.id || blotData.postId || null,
            })
            .eq("id", post.id);
          posted++;
          console.log(`  ✅ Posted: ${post.text.slice(0, 40)}...`);
        } else {
          const errorText = await blotResponse.text();
          await supabase
            .from("marketing_posts")
            .update({
              status: "failed",
              error: `Blotato ${blotResponse.status}: ${errorText.slice(0, 200)}`,
            })
            .eq("id", post.id);
          failed++;
          console.log(`  ❌ Failed: ${errorText.slice(0, 100)}`);
        }
      } catch (postError) {
        await supabase
          .from("marketing_posts")
          .update({
            status: "failed",
            error: (postError as Error).message,
          })
          .eq("id", post.id);
        failed++;
      }
    }

    console.log(`[publish-scheduled-posts] done: posted=${posted}, failed=${failed}`);

    return new Response(
      JSON.stringify({ processed: posts.length, posted, failed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[publish-scheduled-posts] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
