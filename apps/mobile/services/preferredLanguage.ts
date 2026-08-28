import { supabase } from './supabase';

// Persists the language this account reads in to profiles.preferred_language,
// so server-sent email can eventually be written in it. See
// supabase/migrations/20260827000001_profiles_preferred_language.sql.
//
// The choice already lives in AsyncStorage (services/i18n.ts) and has never
// reached the server. A browser announces its language in Accept-Language —
// which is how the unsubscribe page localises itself — but an email has no
// equivalent, so the sender has to know in advance.
//
// Best effort by design. A preference is never worth interrupting a language
// switch or a sign-in over, so every failure path here is silent: no session,
// offline, or the column missing because the migration has not been applied.

// Must match the CHECK constraint on profiles.preferred_language and the
// locale lists in apps/web/src/i18n/routing.ts and ./i18n.ts.
// scripts/validate-locale-contract.mjs fails the build if they drift.
const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'pt', 'de', 'ja', 'ar', 'zh'];

// Remembered per process so a language switch, a foreground event and a
// sign-in don't produce three identical writes.
let lastWritten: { userId: string; language: string } | null = null;

/**
 * Write the language for the signed-in account, if it changed.
 *
 * Safe to call on every language change and on every sign-in — it is a no-op
 * when there is no session, when the value is unsupported, or when this
 * process already wrote the same value.
 */
export async function syncPreferredLanguage(language: string): Promise<void> {
  try {
    if (!SUPPORTED_LANGUAGES.includes(language)) return;

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;

    if (lastWritten?.userId === userId && lastWritten.language === language) {
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ preferred_language: language })
      .eq('id', userId);

    if (error) {
      if (__DEV__) console.warn('[preferredLanguage] write failed:', error.message);
      return;
    }

    lastWritten = { userId, language };
  } catch (err) {
    if (__DEV__) console.warn('[preferredLanguage] sync threw:', err);
  }
}

/** Forget the cached write — call on sign-out so the next account re-syncs. */
export function resetPreferredLanguageCache(): void {
  lastWritten = null;
}
