// Unsubscribe token signing and verification — two generations, one key each.
//
// JUNO-21 of docs/security-audit-2026-09-07.md.
//
// THE DEFECT
// ----------
// send-email and unsubscribe both derived their HMAC key like this:
//
//     Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET")
//       || `juno-unsubscribe-v1:${SUPABASE_SERVICE_ROLE_KEY}`
//
// HMAC-SHA256 is preimage-resistant, so the service-role key never leaked
// through a token. The defect is operational, and it is a compliance one:
// rotating the service-role key — which JUNO-04 asks for — invalidates every
// unsubscribe link already sitting in somebody's inbox. Gmail and Yahoo treat
// a broken List-Unsubscribe as a sender failure (RFC 8058), and a reader who
// clicks "unsubscribe" and is told the link is invalid is a CASL problem for a
// Québec sender, not a UX one.
//
// THE TRAP IN THE OBVIOUS FIX
// ---------------------------
// "Set UNSUBSCRIBE_TOKEN_SECRET before rotating" does not work, and it is the
// natural thing to try. The old code prefers that variable when it is present,
// and Supabase injects secrets into the RUNNING function. So the moment the
// operator sets it, the already-deployed function starts verifying against a
// key that signed nothing — every link ever sent breaks, minutes before the
// new code lands. Setting the secret IS the outage.
//
// That is why the current signing key is read from a name the old code never
// looked at: `UNSUBSCRIBE_TOKEN_SECRET_V2`. Both new variables can therefore be
// provisioned while the old function is still live, with no effect on it, and
// the switchover happens exactly once, on deploy. `UNSUBSCRIBE_TOKEN_SECRET` is
// deliberately NOT read here — see RETIRED_SECRET_ENV.
//
// THE TWO GENERATIONS
// -------------------
//   legacy  <b64url(payload)>.<sig>        signed with UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS
//   v2      v2.<b64url(payload)>.<sig>     signed with UNSUBSCRIBE_TOKEN_SECRET_V2
//
// A token's shape — two parts or three — selects the key. No token is ever
// tried against both, so there is no "which key worked" signal and no reason
// for the caller to learn one. New tokens are only ever signed v2.
//
// DOMAIN SEPARATION. v2 signs the wire prefix `v2.<b64url(payload)>`, legacy
// signs the decoded `<payload>`. Different byte strings, so a signature minted
// under one generation cannot validate under the other even if an operator
// mistakenly configures the same value for both keys.
//
// WHEN LEGACY SUPPORT CAN BE DROPPED
// ----------------------------------
// Unsubscribe tokens never expire, on purpose: a stale unsubscribe link that
// fails is a compliance failure, not a security improvement. So "when the
// tokens expire" is not an answer, and the honest one is a product decision
// with a real cost on both sides. The inputs:
//
//   * every lifecycle email JUNO has ever sent carries a legacy link, and mail
//     is retained by readers indefinitely;
//   * `verifyUnsubscribeToken` reports the generation of every SUCCESS, so
//     `[unsubscribe] ok generation=legacy` in the function logs is a direct
//     measurement of whether anyone still clicks them;
//   * the residual value of the legacy key after the service-role rotation is
//     exactly one capability, the same one the token grants: flipping
//     `notification_preferences.lifecycleEmails` on one profile.
//
// The recommendation, and the reason, are in
// docs/runbooks/unsubscribe-dual-key-2026-09.md §5. Do not unset
// UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS because the transition "looks finished":
// the day it is unset, every legacy link in every inbox becomes a 400.
//
// NO Deno GLOBALS AT MODULE SCOPE. Like _shared/cors.ts, this file is loaded
// whole by vitest (packages/shared/src/security/__tests__/unsubscribe-token.test.ts)
// so the suite tests the deployed bytes rather than a second copy of them. The
// environment arrives as a plain record; `crypto.subtle` is a Web Crypto global
// in both Deno and Node 20+.

/** The only category any unsubscribe token may carry. */
export const UNSUBSCRIBE_CATEGORY = "lifecycle";

/** Wire prefix of a current-generation token. */
export const TOKEN_VERSION = "v2";

/** Signs and verifies v2 tokens. Required — without it, nothing is signed. */
export const CURRENT_SECRET_ENV = "UNSUBSCRIBE_TOKEN_SECRET_V2";

/** Verifies legacy tokens. Optional; its absence disables legacy links. */
export const PREVIOUS_SECRET_ENV = "UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS";

/**
 * Read by NOTHING. Kept as a named constant so the boot-time report can warn
 * about a half-finished migration, and so a reader grepping for the old name
 * lands on this explanation instead of concluding the variable is still live.
 */
export const RETIRED_SECRET_ENV = "UNSUBSCRIBE_TOKEN_SECRET";

/**
 * Longest token this module will even hash.
 *
 * A well-formed token is ~110 characters. The cap exists so an unauthenticated
 * caller cannot make the function HMAC a megabyte per request: both entry
 * points are public by design (the reader is, by definition, not signed in).
 */
export const MAX_TOKEN_LENGTH = 512;

/**
 * Stand-in used when the key a token's generation requires is absent.
 *
 * Returning early in that case would make "legacy verification is switched
 * off" measurable by response time. Instead the HMAC still runs, against this
 * constant, and the result is discarded — the work is the same either way and
 * the answer is always null. It can never accept anything: `signWith` refuses
 * it outright, and a test signs a token with this exact value and asserts the
 * verifier still rejects it.
 */
const ABSENT_KEY_PLACEHOLDER = "juno/unsubscribe/no-key-configured";

export interface UnsubscribeKeyring {
  /** v2 signing + verification key. Empty string means "not configured". */
  readonly current: string;
  /** Legacy verification key. Empty string means "legacy links are dead". */
  readonly previous: string;
}

export type TokenGeneration = "v2" | "legacy";

export interface VerifiedUnsubscribeToken {
  readonly userId: string;
  readonly category: string;
  /**
   * Which key accepted the token. Safe to log and useful to: it is the only
   * way to know when legacy traffic has stopped, and it tells a caller nothing
   * it did not already supply — the generation is visible in the token shape.
   */
  readonly generation: TokenGeneration;
}

type EnvRecord = Readonly<Record<string, string | undefined>>;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** base64url alphabet, unpadded. Anything else is not a token we minted. */
const B64URL_REGEX = /^[A-Za-z0-9_-]+$/;

/**
 * Build the keyring from an environment record.
 *
 * Never falls back to SUPABASE_SERVICE_ROLE_KEY, which is the entire point of
 * JUNO-21, and never reads RETIRED_SECRET_ENV, which is the entire point of
 * the zero-downtime transition.
 */
export function readUnsubscribeKeyring(env: EnvRecord): UnsubscribeKeyring {
  return {
    current: (env[CURRENT_SECRET_ENV] ?? "").trim(),
    previous: (env[PREVIOUS_SECRET_ENV] ?? "").trim(),
  };
}

/**
 * One line for the boot log: which keys are configured, never their values,
 * never their lengths (a length is a real, if small, constraint on a secret).
 *
 * The `retiredStillSet` flag is the one genuinely useful warning here. An
 * operator who set UNSUBSCRIBE_TOKEN_SECRET at some point in the past and does
 * not carry it into PREVIOUS has silently broken every link already sent, and
 * nothing else in the system would say so.
 */
export function describeKeyring(env: EnvRecord): string {
  const keyring = readUnsubscribeKeyring(env);
  const retiredStillSet = ((env[RETIRED_SECRET_ENV] ?? "").trim().length > 0);
  const parts = [
    `${CURRENT_SECRET_ENV}=${keyring.current ? "set" : "MISSING"}`,
    `${PREVIOUS_SECRET_ENV}=${keyring.previous ? "set" : "unset"}`,
  ];
  if (retiredStillSet) {
    parts.push(
      `${RETIRED_SECRET_ENV}=set-but-ignored` +
        (keyring.previous
          ? ""
          : ` (WARNING: links signed with it cannot be verified — copy it into ${PREVIOUS_SECRET_ENV})`),
    );
  }
  return parts.join(" ");
}

function b64UrlEncode(binary: string): string {
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(value: string): string | null {
  if (!B64URL_REGEX.test(value)) return null;
  const pad = (4 - (value.length % 4)) % 4;
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(value.length + pad, "=");
  try {
    return atob(b64);
  } catch {
    return null;
  }
}

async function signWith(value: string, secret: string): Promise<string> {
  if (!secret) throw new Error("signWith called with an empty secret");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return b64UrlEncode(bin);
}

/**
 * Compare two base64url signatures without an early out on content.
 *
 * The length check is not a leak: HMAC-SHA256 base64url is always 43
 * characters, so a mismatched length means the caller sent something that was
 * never a signature.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isValidPayload(userId: string, category: string): boolean {
  return UUID_REGEX.test(userId) && category === UNSUBSCRIBE_CATEGORY;
}

/**
 * Mint a current-generation token, or null when no signing key is configured.
 *
 * Null is the fail-closed answer and the caller must handle it: send-email
 * omits the List-Unsubscribe header rather than shipping a link that cannot be
 * verified. A misconfiguration that silently produced unverifiable links would
 * be worse than one that produces none, because the reader would be told their
 * opt-out failed.
 */
export async function signUnsubscribeToken(
  userId: string,
  category: string,
  keyring: UnsubscribeKeyring,
): Promise<string | null> {
  if (!keyring.current) return null;
  if (!isValidPayload(userId, category)) return null;

  const payload = `${userId}:${category}`;
  const b64Payload = b64UrlEncode(payload);
  const sig = await signWith(`${TOKEN_VERSION}.${b64Payload}`, keyring.current);
  return `${TOKEN_VERSION}.${b64Payload}.${sig}`;
}

/**
 * Verify a token of either generation.
 *
 * Returns null for every failure, with no indication of which check failed:
 * an unknown version, a bad signature, a tampered payload, an absent key and
 * an unknown category are one answer. The caller has nothing useful to do with
 * the difference, and an attacker would.
 */
export async function verifyUnsubscribeToken(
  token: string,
  keyring: UnsubscribeKeyring,
): Promise<VerifiedUnsubscribeToken | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split(".");

  let generation: TokenGeneration;
  let b64Payload: string;
  let sig: string;
  let secret: string;
  let signedInput: string;

  if (parts.length === 3 && parts[0] === TOKEN_VERSION) {
    generation = "v2";
    b64Payload = parts[1];
    sig = parts[2];
    secret = keyring.current;
    signedInput = `${TOKEN_VERSION}.${b64Payload}`;
  } else if (parts.length === 2) {
    generation = "legacy";
    b64Payload = parts[0];
    sig = parts[1];
    secret = keyring.previous;
    // Legacy signed the DECODED payload, not the wire form. Resolved below,
    // once the payload has actually decoded.
    signedInput = "";
  } else {
    return null;
  }

  const payload = b64UrlDecode(b64Payload);
  if (payload === null) return null;
  if (generation === "legacy") signedInput = payload;

  // Constant work whether or not the key for this generation exists — see
  // ABSENT_KEY_PLACEHOLDER. The result of this HMAC is thrown away when the
  // real key is missing.
  const expected = await signWith(signedInput, secret || ABSENT_KEY_PLACEHOLDER);
  if (!secret) return null;
  if (!constantTimeEqual(sig, expected)) return null;

  const colonIdx = payload.lastIndexOf(":");
  if (colonIdx <= 0) return null;
  const userId = payload.slice(0, colonIdx);
  const category = payload.slice(colonIdx + 1);
  if (!isValidPayload(userId, category)) return null;

  return { userId, category, generation };
}
