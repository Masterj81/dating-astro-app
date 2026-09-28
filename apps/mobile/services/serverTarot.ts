// JUNO-06 — server-generated tarot reading client.
//
// The reading is a SERVER artifact (supabase/functions/premium-tarot-reading):
// enforce_premium_feature decides, the edge draws with the shared engine, and
// this client receives ONLY the authorized result. It imports NO corpus and
// NO engine — the APK no longer carries the tarot content (the operator's
// blocage 1: a patched APK must not be able to produce the premium result).
//
// Determinism note: the same (user, mode, period) still yields the same cards
// — the seed lives server-side and the edge reuses the exact shared engine.
//
// PR B (hardening): the failure side used to collapse everything but
// premium_required into 'server'. The typed contract below mirrors the EDGE's
// own vocabulary (index.ts of premium-tarot-reading — no invented codes):
//   401 unauthenticated · 402 premium_required (reason insufficient_tier) ·
//   429 rate_limited (platform-level; the edge itself emits none) ·
//   400 invalid_body · 405 method_not_allowed · 500 config_error ·
//   503 decision_unavailable — plus transport ('network') and the honest
//   unknown ('server'). The HTTP STATUS is the primary source; the body's
//   reason only refines 402. No failure ever carries a reading, cards,
//   meanings, a tier or a grant — the type structurally forbids it.

import { supabase } from './supabase';
import { attemptSessionRenewal } from '../utils/sessionRenewal';

export type TarotPeriod = 'weekly' | 'monthly';
export type TarotMode = 'love' | 'general';

export type ServerTarotCard = {
  id: string;
  imageFile: string;
  name: string;
  reversed: boolean;
  meaning: string;
  isFallback: boolean;
};

export type ServerTarotReading = {
  mode: TarotMode;
  period: TarotPeriod;
  locale: string;
  seed: string;
  generatedAt: string;
  isFallback: boolean;
  cards: { position: string; card: ServerTarotCard }[];
};

// Every failure mode this client can distinguish. The first seven are the
// edge's/platform's own answers; 'network' is a transport failure (no HTTP
// answer); 'server' is an answer that could not be classified (unknown
// status, malformed body, shapeless 200). Structurally grant-free: no field
// below can hold a reading, a card, a meaning or a tier.
export type TarotFailureCode =
  | 'unauthenticated'
  | 'premium_required'
  | 'rate_limited'
  | 'decision_unavailable'
  | 'config_error'
  | 'invalid_body'
  | 'method_not_allowed'
  | 'network'
  | 'server';

export type TarotFetch =
  | { ok: true; reading: ServerTarotReading; viaFreePreview: boolean }
  | {
      ok: false;
      code: TarotFailureCode;
      // Present ONLY on 402 — the edge's bounded reason (insufficient_tier
      // unless it says otherwise). Never a reading.
      reason?: string;
      // Present ONLY on a platform 429 that carried a parseable Retry-After
      // (seconds, clamped to [1, 3600]). Display hint only — never a retry
      // scheduler. The edge emits no business 429 and no business delay.
      retryAfterSeconds?: number;
    };

type TarotErrorBody = { error?: string; reason?: string } | null;

/**
 * Pure: map an HTTP answer to the client failure code. The STATUS decides;
 * the body only refines the 402 reason. Exported for the behavior suite —
 * this mapping IS the contract.
 */
export function classifyTarotHttpError(
  status: number,
  body: TarotErrorBody,
  retryAfterSeconds?: number,
): TarotFetch {
  switch (status) {
    case 401:
      return { ok: false, code: 'unauthenticated' };
    case 402:
      return { ok: false, code: 'premium_required', reason: body?.reason ?? 'insufficient_tier' };
    case 429: {
      const failure: Extract<TarotFetch, { ok: false }> = { ok: false, code: 'rate_limited' };
      if (typeof retryAfterSeconds === 'number') failure.retryAfterSeconds = retryAfterSeconds;
      return failure;
    }
    case 400:
      return { ok: false, code: 'invalid_body' };
    case 405:
      return { ok: false, code: 'method_not_allowed' };
    case 500:
      return { ok: false, code: 'config_error' };
    case 503:
      return { ok: false, code: 'decision_unavailable' };
    default:
      return { ok: false, code: 'server' };
  }
}

/**
 * Read a supabase-js functions.invoke failure WITHOUT trusting its shape.
 * A non-2xx edge answer surfaces as FunctionsHttpError whose `.context` is
 * the raw Response (status + headers + body) — the documented pattern of the
 * installed functions-js (2.114.0: `await error.context.json()`). A transport
 * failure carries no context. The body is consumed ONCE here (this module is
 * its only reader); an absent, already-consumed, non-JSON or throwing json()
 * degrades to body=null — the status still classifies, nothing throws.
 * Retry-After is read only for a 429 and only as a bounded display hint.
 * Nothing from the Response (headers, body, object) is ever logged.
 */
async function readInvokeError(error: unknown): Promise<{
  status: number | null;
  body: TarotErrorBody;
  retryAfterSeconds?: number;
}> {
  const ctx = (error as { context?: unknown } | null | undefined)?.context;
  if (!ctx || typeof ctx !== 'object') return { status: null, body: null };

  const maybeStatus = (ctx as { status?: unknown }).status;
  const status = typeof maybeStatus === 'number' ? maybeStatus : null;

  let retryAfterSeconds: number | undefined;
  if (status === 429) {
    const header = (ctx as { headers?: { get?: (name: string) => string | null } }).headers?.get?.(
      'retry-after',
    );
    const parsed = typeof header === 'string' ? Number.parseInt(header, 10) : Number.NaN;
    // Seconds only (the platform's format); ignore dates; clamp for display.
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 3600) {
      retryAfterSeconds = parsed;
    }
  }

  let body: TarotErrorBody = null;
  if (typeof (ctx as { json?: unknown }).json === 'function') {
    try {
      const parsed = await (ctx as { json: () => Promise<unknown> }).json();
      body = parsed && typeof parsed === 'object' ? (parsed as TarotErrorBody) : null;
    } catch {
      body = null; // malformed/unreadable — the status alone decides
    }
  }
  return { status, body, retryAfterSeconds };
}

// Single-flight: one invocation per exact (period, mode, locale) at a time.
// A double tap, a re-fired effect or a repeated Try Again with the SAME
// parameters JOINS the in-flight promise — exactly one edge invocation, one
// shared result, one potential consumption. Different parameters get their
// own promise (a mode switch is a different, intentional request); the
// screen-level controller decides which answer is still current. The entry
// is removed in a finally, so an error never wedges the map.
const tarotInFlight = new Map<string, Promise<TarotFetch>>();

export async function fetchTarotReading(
  period: TarotPeriod,
  mode: TarotMode,
  locale: string,
): Promise<TarotFetch> {
  const key = `${period}|${mode}|${locale}`;
  const existing = tarotInFlight.get(key);
  if (existing) return existing;

  const invocation = runFetchTarotReading(period, mode, locale).finally(() => {
    tarotInFlight.delete(key);
  });
  // Acquired synchronously, BEFORE the first await of the underlying call —
  // two callers in the same tick can never both miss.
  tarotInFlight.set(key, invocation);
  return invocation;
}

async function runFetchTarotReading(
  period: TarotPeriod,
  mode: TarotMode,
  locale: string,
): Promise<TarotFetch> {
  let renewalSpent = false;

  // At most TWO edge invocations: the original call plus exactly ONE
  // re-invocation after a SUCCESSFUL 401 session renewal. No other retry
  // exists — 400/402/405/429/500/503/network are terminal for this call.
  for (let attempt = 0; attempt < 2; attempt++) {
    let invoked: { data: unknown; error: unknown };
    try {
      invoked = await supabase.functions.invoke('premium-tarot-reading', {
        body: { period, mode, locale },
      });
    } catch {
      return { ok: false, code: 'network' };
    }

    const { data, error } = invoked as { data: unknown; error: unknown };

    if (error) {
      const { status, body, retryAfterSeconds } = await readInvokeError(error);

      if (status === null) {
        // No HTTP answer to read: transport failure. Never a reading.
        return { ok: false, code: 'network' };
      }

      if (status === 401 && !renewalSpent) {
        renewalSpent = true;
        if (await attemptSessionRenewal()) {
          continue; // the single bounded re-invocation, on the renewed session
        }
        return { ok: false, code: 'unauthenticated' };
      }

      return classifyTarotHttpError(status, body, retryAfterSeconds);
    }

    const payload = data as
      | { success: true; reading: ServerTarotReading; viaFreePreview?: boolean }
      | { success: false; error: string; reason?: string }
      | null;

    if (!payload) return { ok: false, code: 'server' };

    if (!payload.success) {
      // Defensive: the edge answers success:false only on non-2xx, never in a
      // 200 body — if it ever does, map its own vocabulary, fail closed.
      if (payload.error === 'unauthenticated') {
        return { ok: false, code: 'unauthenticated' };
      }
      if (payload.error === 'premium_required') {
        return { ok: false, code: 'premium_required', reason: payload.reason ?? 'insufficient_tier' };
      }
      return { ok: false, code: 'server' };
    }

    // Structural validation: never trust a payload shape blindly. Everything
    // the screen renders must exist and be typed; a malformed 200 is a
    // controlled 'server' refusal, never a partial render.
    const r = payload.reading;
    if (
      !r ||
      r.period !== period ||
      r.mode !== mode ||
      typeof r.seed !== 'string' ||
      typeof r.isFallback !== 'boolean' ||
      !Array.isArray(r.cards) ||
      r.cards.length === 0 ||
      !r.cards.every(
        (entry) =>
          typeof entry?.position === 'string' &&
          typeof entry?.card?.id === 'string' &&
          typeof entry.card.imageFile === 'string' &&
          typeof entry.card.name === 'string' &&
          typeof entry.card.meaning === 'string' &&
          entry.card.meaning.length > 0 &&
          typeof entry.card.reversed === 'boolean' &&
          typeof entry.card.isFallback === 'boolean',
      )
    ) {
      return { ok: false, code: 'server' };
    }

    return { ok: true, reading: r, viaFreePreview: payload.viaFreePreview === true };
  }

  // Second 401 after a successful renewal: the renewal budget is spent.
  // Fail-closed, explicitly — the reader must re-sign-in.
  return { ok: false, code: 'unauthenticated' };
}

/**
 * Card art base — the public `tarot` bucket. Kept HERE (not re-imported from
 * @astro/shared) so the mobile tarot surface needs NOTHING from the shared
 * tarot package: importing it for one URL helper would pull the engine and
 * both corpora back into the APK, which is exactly what JUNO-06 removes.
 * The functions mirror the shared ones verbatim; validate:premium-data-sources
 * asserts the mobile tarot screens no longer import '@astro/shared/tarot'.
 */
export function tarotArtBaseUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/tarot`;
}

export function tarotCardImageUrl(baseUrl: string, imageFile: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${imageFile}`;
}
