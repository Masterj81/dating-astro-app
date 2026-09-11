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
 * The confirmation email is rendered by `account-deletion-email.ts`, not here.
 *
 * It used to be: a `deletionEmailText(purgeComplete)` lived in this file, and
 * its one rule — say the media are gone ONLY when the purge reported that they
 * are — is now enforced there, on both the HTML and the text a reader receives.
 * What stays here is the decision that rule depends on: `WebPurgeOutcome.done`
 * is the purge's own report, and the route hands exactly that to the renderer.
 * A copy of the copy in two places is how the two ephemerides and the two tarot
 * decks in this repository drifted.
 */
