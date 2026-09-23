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

import { supabase } from './supabase';

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

export type TarotFetch =
  | { ok: true; reading: ServerTarotReading; viaFreePreview: boolean }
  | { ok: false; code: 'unauthenticated' | 'premium_required' | 'network' | 'server' };

export async function fetchTarotReading(
  period: TarotPeriod,
  mode: TarotMode,
  locale: string,
): Promise<TarotFetch> {
  try {
    const { data, error } = await supabase.functions.invoke('premium-tarot-reading', {
      body: { period, mode, locale },
    });

    if (error) {
      // supabase-js surfaces the edge's non-2xx answers as FunctionsHttpError
      // with the raw Response in `.context` — the 402 body (premium_required)
      // lives there. A transport failure carries no context and maps to
      // 'server'/'network' below; neither is ever a reading.
      const ctx = (error as { context?: Response | undefined }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = (await ctx.json()) as { error?: string } | null;
          if (body?.error === 'premium_required') {
            return { ok: false, code: 'premium_required' };
          }
          if (body?.error === 'unauthenticated') {
            return { ok: false, code: 'unauthenticated' };
          }
        } catch {
          // unreadable body — fall through to the generic refusal
        }
      }
      return { ok: false, code: 'server' };
    }

    const payload = data as
      | { success: true; reading: ServerTarotReading; viaFreePreview?: boolean }
      | { success: false; error: string; reason?: string }
      | null;

    if (!payload) return { ok: false, code: 'server' };

    if (!payload.success) {
      if (payload.error === 'unauthenticated') {
        return { ok: false, code: 'unauthenticated' };
      }
      if (payload.error === 'premium_required') {
        return { ok: false, code: 'premium_required' };
      }
      return { ok: false, code: 'server' };
    }

    // Structural validation: never trust a payload shape blindly.
    const r = payload.reading;
    if (
      !r ||
      r.period !== period ||
      r.mode !== mode ||
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
          typeof entry.card.reversed === 'boolean',
      )
    ) {
      return { ok: false, code: 'server' };
    }

    return { ok: true, reading: r, viaFreePreview: payload.viaFreePreview === true };
  } catch {
    return { ok: false, code: 'network' };
  }
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
