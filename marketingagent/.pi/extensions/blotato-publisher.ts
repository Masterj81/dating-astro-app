/**
 * Blotato Publisher Extension
 *
 * Handles posting content to social media platforms via the Blotato API.
 * Supports Facebook, Instagram, Twitter/X, LinkedIn.
 *
 * API: https://api.blotato.com
 * Endpoint: POST /v1/posts
 * Auth: Bearer token
 */

const BLOTATO_API_URL = "https://api.blotato.com/v1/posts";

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

  try {
    const body: Record<string, unknown> = {
      content: options.content,
      platforms: options.platforms,
    };

    if (options.scheduledFor) {
      body.scheduled_for = options.scheduledFor;
    }

    if (options.imageUrl) {
      body.media = [{ type: "image", url: options.imageUrl }];
    }

    const response = await fetch(BLOTATO_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Blotato API error ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      postId: data.id || data.postId,
      platformResults: data.platforms || undefined,
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
