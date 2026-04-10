/**
 * Blotato Publisher Extension
 *
 * Handles posting content to social media platforms via the Blotato API.
 * Supports Facebook, Instagram, Twitter/X, LinkedIn.
 *
 * API: https://backend.blotato.com
 * Endpoint: POST /v2/posts
 * Auth: blotato-api-key header
 */

import { ensurePublicUrl } from "../../upload-image.js";

const BLOTATO_API_URL = "https://backend.blotato.com/v2/posts";

export type Platform = "facebook" | "instagram" | "twitter" | "linkedin";

export interface PublishOptions {
  content: string;
  platforms: Platform[];
  scheduledFor?: string; // ISO date string for scheduled posting
  imageUrl?: string;     // Optional image attachment
}

export interface PublishResult {
  success: boolean;
  postId?: string;
  platformResults?: Record<Platform, { success: boolean; id?: string; error?: string }>;
  error?: string;
}

export async function publish(options: PublishOptions): Promise<PublishResult> {
  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) {
    return { success: false, error: "BLOTATO_API_KEY not configured" };
  }

  const fbPageId = process.env.BLOTATO_FB_PAGE_ID;

  try {
    const platformResults: Record<string, { success: boolean; id?: string; error?: string }> = {};
    // Upload local images to Supabase Storage so Blotato gets a public URL
    const resolvedImageUrl = await ensurePublicUrl(options.imageUrl);
    const mediaUrls = resolvedImageUrl ? [resolvedImageUrl] : [];

    for (const platform of options.platforms) {
      const accountId = platform === 'instagram'
        ? process.env.BLOTATO_IG_ACCOUNT_ID
        : process.env.BLOTATO_FB_ACCOUNT_ID;
      if (!accountId) {
        platformResults[platform] = { success: false, error: `BLOTATO_${platform === 'instagram' ? 'IG' : 'FB'}_ACCOUNT_ID not configured` };
        continue;
      }

      // Instagram requires an image — skip if text-only
      if (platform === 'instagram' && mediaUrls.length === 0) {
        platformResults[platform] = { success: false, error: 'Instagram requires an image — skipped' };
        continue;
      }

      const target: Record<string, string> = { targetType: platform };
      if (platform === "facebook") {
        if (!fbPageId) {
          platformResults[platform] = { success: false, error: "BLOTATO_FB_PAGE_ID not set — required for Facebook posts" };
          continue;
        }
        target.pageId = fbPageId;
      }

      const postBody: Record<string, unknown> = {
        post: {
          accountId,
          content: { text: options.content, mediaUrls, platform },
          target,
        },
      };

      if (options.scheduledFor) {
        (postBody.post as Record<string, unknown>).scheduledTime = options.scheduledFor;
      }

      const response = await fetch(BLOTATO_API_URL, {
        method: "POST",
        headers: {
          "blotato-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        platformResults[platform] = {
          success: false,
          error: `Blotato API error ${response.status}: ${errorText.slice(0, 200)}`,
        };
        continue;
      }

      const data = await response.json();
      platformResults[platform] = {
        success: true,
        id: data.postSubmissionId || data.id || data.postId,
      };
    }

    const allFailed = Object.values(platformResults).every((r) => !r.success);
    const firstSuccess = Object.values(platformResults).find((r) => r.success);
    const errors = Object.entries(platformResults)
      .filter(([, r]) => !r.success)
      .map(([p, r]) => `${p}: ${r.error}`);

    if (allFailed) {
      return {
        success: false,
        error: `All platforms failed — ${errors.join("; ")}`,
        platformResults: platformResults as Record<Platform, { success: boolean; id?: string; error?: string }>,
      };
    }

    return {
      success: true,
      postId: firstSuccess?.id,
      platformResults: platformResults as Record<Platform, { success: boolean; id?: string; error?: string }>,
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error: ${(err as Error).message}`,
    };
  }
}

/**
 * Schedule a post for a future time via Blotato.
 */
export async function schedulePost(
  content: string,
  platforms: Platform[],
  scheduledFor: Date,
  imageUrl?: string,
): Promise<PublishResult> {
  return publish({
    content,
    platforms,
    scheduledFor: scheduledFor.toISOString(),
    imageUrl,
  });
}

/**
 * Get next available posting window.
 * Best times: 11 AM-1 PM, 7-9 PM EST, Tue/Thu/Sat
 */
export function getNextPostingWindow(): Date {
  const now = new Date();
  const est = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = est.getHours();
  const day = est.getDay();

  // Best posting hours: 11-13, 19-21
  const bestHours = [11, 12, 19, 20];
  // Best days: Tue(2), Thu(4), Sat(6)
  const bestDays = [2, 4, 6];

  const target = new Date(est);

  // Find next best slot
  for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
    target.setDate(est.getDate() + daysAhead);
    const targetDay = target.getDay();

    if (!bestDays.includes(targetDay) && daysAhead > 0) continue;

    for (const h of bestHours) {
      if (daysAhead === 0 && h <= hour) continue;
      target.setHours(h, 0, 0, 0);
      return target;
    }
  }

  // Fallback: tomorrow at 11 AM
  target.setDate(est.getDate() + 1);
  target.setHours(11, 0, 0, 0);
  return target;
}
