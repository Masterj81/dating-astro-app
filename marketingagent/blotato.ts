/**
 * Unified Blotato publishing client.
 *
 * Previously the same "POST /v2/posts per platform, skip Instagram without
 * image, aggregate partial failures" loop was duplicated three times:
 *   - agent.ts                     → submitToBlotato()
 *   - dashboard.ts                 → publishToBlotato()
 *   - .pi/extensions/blotato-publisher.ts → publish()
 *
 * Each drifted subtly (options, error shape). This module is the single
 * implementation; callers pick the convenience wrapper they need.
 */

import { BLOTATO_API_URL } from "./constants.js";
import { ensurePublicUrl } from "./upload-image.js";
import { fetchWithTimeout } from "./lib.js";

export interface BlotatoOptions {
  /** Schedule the post for a specific instant (absolute). */
  scheduledTime?: Date;
  /** Let Blotato pick the next free slot in its queue. */
  useNextFreeSlot?: boolean;
}

export interface BlotatoPlatformResult {
  platform: string;
  success: boolean;
  postId?: string;
  error?: string;
}

export interface BlotatoResult {
  success: boolean;
  /** First successful platform's submission ID, for callers that just need one. */
  postId?: string;
  /** Scheduled time echoed back by Blotato when available. */
  scheduledTime?: string;
  /** Concatenated partial-failure message when some platforms fail. */
  error?: string;
  /** Per-platform breakdown for callers that care (e.g. future dashboards). */
  platformResults: BlotatoPlatformResult[];
}

function extractScheduledTime(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const record = data as Record<string, unknown>;
  if (typeof record.scheduledTime === "string") {
    return record.scheduledTime;
  }

  for (const key of ["post", "postSubmission"]) {
    const nested = record[key];
    if (!nested || typeof nested !== "object") continue;

    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.scheduledTime === "string") {
      return nestedRecord.scheduledTime;
    }
  }

  return undefined;
}

/**
 * POST one post per platform to Blotato.
 *
 * Returns success=true if at least one platform succeeded. Partial failures
 * populate `.error` with "platform1: reason; platform2: reason" so the caller
 * can surface it without each call site rebuilding the string.
 */
export async function submitToBlotato(
  text: string,
  platforms: string[],
  imageUrl?: string,
  options: BlotatoOptions = {},
): Promise<BlotatoResult> {
  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "BLOTATO_API_KEY not set",
      platformResults: [],
    };
  }

  const fbPageId = process.env.BLOTATO_FB_PAGE_ID;
  const resolvedImageUrl = await ensurePublicUrl(imageUrl);

  const platformResults: BlotatoPlatformResult[] = [];
  let firstScheduledTime: string | undefined;

  try {
    for (const platform of platforms) {
      const accountId = platform === "instagram"
        ? process.env.BLOTATO_IG_ACCOUNT_ID
        : process.env.BLOTATO_FB_ACCOUNT_ID;

      if (!accountId) {
        platformResults.push({
          platform,
          success: false,
          error: `BLOTATO_${platform === "instagram" ? "IG" : "FB"}_ACCOUNT_ID not set`,
        });
        continue;
      }

      // Instagram requires an image — skip if text-only.
      if (platform === "instagram" && !resolvedImageUrl) {
        platformResults.push({
          platform,
          success: false,
          error: "Instagram requires an image — skipped",
        });
        continue;
      }

      const target: Record<string, string> = { targetType: platform };
      if (platform === "facebook") {
        if (!fbPageId) {
          platformResults.push({
            platform,
            success: false,
            error: "BLOTATO_FB_PAGE_ID not set — required for Facebook posts",
          });
          continue;
        }
        target.pageId = fbPageId;
      }

      const body = {
        post: {
          accountId,
          content: {
            text,
            mediaUrls: resolvedImageUrl ? [resolvedImageUrl] : [],
            platform,
          },
          target,
        },
        ...(options.scheduledTime
          ? { scheduledTime: options.scheduledTime.toISOString() }
          : options.useNextFreeSlot
            ? { useNextFreeSlot: true }
            : {}),
      };

      const response = await fetchWithTimeout(BLOTATO_API_URL, {
        method: "POST",
        timeoutMs: 30_000,
        headers: {
          "blotato-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        platformResults.push({
          platform,
          success: false,
          error: `Blotato API ${response.status}: ${errorText.slice(0, 200)}`,
        });
        continue;
      }

      const data = await response.json();
      const scheduledTime = extractScheduledTime(data);
      if (!firstScheduledTime && scheduledTime) {
        firstScheduledTime = scheduledTime;
      }
      platformResults.push({
        platform,
        success: true,
        postId: data.postSubmissionId || data.id || data.postId || "unknown",
      });
    }
  } catch (err) {
    return {
      success: false,
      error: `Network error posting to Blotato: ${(err as Error).message}`,
      platformResults,
    };
  }

  const firstSuccess = platformResults.find((r) => r.success);
  const errors = platformResults.filter((r) => !r.success).map((r) => `${r.platform}: ${r.error}`);

  if (!firstSuccess) {
    return {
      success: false,
      error: `All platforms failed — ${errors.join("; ")}`,
      platformResults,
    };
  }

  return {
    success: true,
    postId: firstSuccess.postId,
    ...(firstScheduledTime ? { scheduledTime: firstScheduledTime } : {}),
    ...(errors.length > 0 ? { error: `Partial failure — ${errors.join("; ")}` } : {}),
    platformResults,
  };
}
