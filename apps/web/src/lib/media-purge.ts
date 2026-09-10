// JUNO-09 — the web side of the media purge.
//
// WHY THIS IS A MODULE AND NOT PART OF THE ROUTE
// ---------------------------------------------------------------------------
// A Next.js App Router `route.ts` may export ONLY the HTTP method handlers and a
// fixed set of config names. Anything else fails the build with a type error
// against `{ [x: string]: never }`. These helpers need to be importable — by the
// route, and by the vitest suite that executes the real decision rather than a
// copy of it — so they live here.
//
// WHY THE PURGE ITSELF IS NOT HERE
// ---------------------------------------------------------------------------
// It lives in `supabase/functions/purge-user-media/index.ts`, once. This route is
// Node and `process-expired-deletions` is Deno; two copies of a deletion routine
// drift, and this repository has watched that happen twice — two ephemerides and
// two tarot decks, both already divergent when found. Both executors call the
// same edge function, and `scripts/validate-media-purge.mjs` proves that neither
// grew its own copy.
//
// The web flow stays IMMEDIATE. JUNO-19 — whether the web should adopt the mobile
// 7-day grace window — is a separate, still-open product question, and nothing
// here presumes an answer to it.

/** The one function allowed to delete a user's media. */
export const PURGE_FUNCTION_PATH = "/functions/v1/purge-user-media";

export interface WebPurgeOutcome {
  /** The durable job row exists. FALSE forbids deleting the account. */
  jobCreated: boolean;
  /** Every bucket finished. Decides what the confirmation email may claim. */
  done: boolean;
}

export interface PurgeRequestDeps {
  baseUrl: string;
  secret: string;
  fetchImpl: typeof fetch;
}

/**
 * Ask `purge-user-media` to record a job and purge, for one account.
 *
 * FAIL-CLOSED ON `jobCreated`: an unset secret, a network error, a non-2xx or a
 * malformed body all yield `false`, and the caller then refuses to delete.
 * Deleting without the job row would strand the media with no record that it
 * exists — the finding itself. Guessing "it probably worked" is how an orphan is
 * created that nothing knows about.
 *
 * Nothing about a failure is logged beyond a status code: a storage or fetch
 * error message carries a URL, and that URL carries the user id.
 */
export async function requestMediaPurge(
  userId: string,
  deps: PurgeRequestDeps,
): Promise<WebPurgeOutcome> {
  if (!deps.secret || !deps.baseUrl) {
    console.error("Media purge not configured — account deletion refused");
    return { jobCreated: false, done: false };
  }
  try {
    const response = await deps.fetchImpl(`${deps.baseUrl}${PURGE_FUNCTION_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-media-purge-secret": deps.secret,
      },
      body: JSON.stringify({ userId, requestedBy: "web_immediate" }),
    });
    if (!response.ok) {
      console.error(`Media purge refused: status=${response.status}`);
      return { jobCreated: false, done: false };
    }
    const payload = await response.json().catch(() => null);
    if (!payload || payload.jobCreated !== true) {
      return { jobCreated: false, done: false };
    }
    return { jobCreated: true, done: payload.done === true };
  } catch {
    console.error("Media purge call threw — account deletion refused");
    return { jobCreated: false, done: false };
  }
}

/**
 * The confirmation email.
 *
 * The previous text said: "All associated data (profile, matches, messages) has
 * been removed." Two things were wrong with it, and both mattered.
 *
 * It named `matches`, a table retired in May 2026 — the product has
 * conversations. And it asserted a completed deletion at a moment when no media
 * had been deleted at all, and when, even now, a slow bucket can leave files for
 * the resume cron. Telling someone their data is gone when it is not is the part
 * of this finding a reader could actually be harmed by: it is the sentence they
 * would rely on when deciding not to follow up.
 *
 * So the text follows the measurement rather than the intent.
 */
export function deletionEmailText(purgeComplete: boolean): string {
  const opening = "Hi,\n\nYour JUNO account has been permanently deleted.\n\n";
  const body = purgeComplete
    ? "Your profile, conversations, messages and uploaded files (photos, voice " +
      "intro, verification video) have all been removed.\n\n"
    : "Your profile, conversations and messages have been removed. A small " +
      "number of uploaded files are still being deleted and will be gone " +
      "within 24 hours.\n\n";
  return (
    opening + body +
    "If you didn't request this, please contact us immediately at " +
    "support@astrodatingapp.com.\n\n- The JUNO Team"
  );
}
