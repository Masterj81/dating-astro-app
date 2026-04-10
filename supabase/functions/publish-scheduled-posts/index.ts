import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BLOTATO_API_URL = "https://backend.blotato.com/v2/posts";
const SECRET = Deno.env.get("SCHEDULED_POSTS_SECRET") || "";
const BLOTATO_KEY = Deno.env.get("BLOTATO_API_KEY") || "";
const BLOTATO_FB_ACCOUNT_ID = Deno.env.get("BLOTATO_FB_ACCOUNT_ID") || "";
const BLOTATO_IG_ACCOUNT_ID = Deno.env.get("BLOTATO_IG_ACCOUNT_ID") || "";
const BLOTATO_FB_PAGE_ID = Deno.env.get("BLOTATO_FB_PAGE_ID") || "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth: shared secret header
  const secretHeader = req.headers.get("x-scheduled-posts-secret") || "";
  const authHeader = req.headers.get("authorization") || "";
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
        const platforms: string[] = post.platforms || ["facebook", "instagram"];
        const mediaUrls = post.image_url ? [post.image_url] : [];
        const platformErrors: string[] = [];
        let platformPosted = false;
        let lastPostId: string | null = null;

        for (const platform of platforms) {
          const accountId = platform === 'instagram'
            ? BLOTATO_IG_ACCOUNT_ID
            : BLOTATO_FB_ACCOUNT_ID;
          if (!accountId) {
            platformErrors.push(`${platform}: BLOTATO_${platform === 'instagram' ? 'IG' : 'FB'}_ACCOUNT_ID not set`);
            continue;
          }

          // Instagram requires an image — skip if text-only
          if (platform === 'instagram' && mediaUrls.length === 0) {
            platformErrors.push(`${platform}: Instagram requires an image — skipped`);
            continue;
          }

          const target: Record<string, string> = { targetType: platform };
          if (platform === "facebook") {
            if (!BLOTATO_FB_PAGE_ID) {
              platformErrors.push(`${platform}: BLOTATO_FB_PAGE_ID not set`);
              continue;
            }
            target.pageId = BLOTATO_FB_PAGE_ID;
          }

          const blotResponse = await fetch(BLOTATO_API_URL, {
            method: "POST",
            headers: {
              "blotato-api-key": BLOTATO_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              post: {
                accountId,
                content: { text: post.text, mediaUrls, platform },
                target,
              },
            }),
          });

          if (blotResponse.ok) {
            const blotData = await blotResponse.json();
            lastPostId = blotData.postSubmissionId || blotData.id || blotData.postId || null;
            platformPosted = true;
            console.log(`  ✅ Posted to ${platform}: ${post.text.slice(0, 40)}...`);
          } else {
            const errorText = await blotResponse.text();
            platformErrors.push(`${platform}: Blotato ${blotResponse.status}: ${errorText.slice(0, 200)}`);
            console.log(`  ❌ Failed ${platform}: ${errorText.slice(0, 100)}`);
          }
        }

        if (platformPosted) {
          await supabase
            .from("marketing_posts")
            .update({
              status: "posted",
              posted_at: new Date().toISOString(),
              blotato_post_id: lastPostId,
              ...(platformErrors.length > 0 ? { error: `Partial failure — ${platformErrors.join("; ")}` } : {}),
            })
            .eq("id", post.id);
          posted++;
        } else {
          await supabase
            .from("marketing_posts")
            .update({
              status: "failed",
              error: `All platforms failed — ${platformErrors.join("; ")}`,
            })
            .eq("id", post.id);
          failed++;
        }
      } catch (postError) {
        await supabase
          .from("marketing_posts")
          .update({
            status: "failed",
            error: `Network error: ${(postError as Error).message}`,
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
