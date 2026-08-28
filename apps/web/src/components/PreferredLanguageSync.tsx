"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Persists the language this account is reading in to
// profiles.preferred_language, so server-sent email can eventually be written
// in it. See supabase/migrations/20260827000001_profiles_preferred_language.sql.
//
// Renders nothing and is mounted once, globally, under LocaleProviders — the
// locale can change on any route, not only inside the app shell.
//
// Three properties this must hold, in order of importance:
//
//   1. It can never break a page. Every failure path is swallowed: a signed-out
//      visitor, an offline write, a column that does not exist yet because the
//      migration has not been applied. None of that is worth an error boundary
//      over a preference.
//   2. It never writes on behalf of a signed-out visitor, and never for a user
//      other than the session's own — the row is scoped by auth.uid() in RLS,
//      but the client should not even try.
//   3. It writes at most once per (user, locale) per browser session. Without
//      that guard it would fire on every navigation.
//
// Last device wins: someone who reads French on mobile and then opens the web
// app in English is recorded as English. That is the intended reading — the
// column records the language currently in use, not a sticky account setting,
// because there is no UI anywhere to set one explicitly.

const SUPPORTED = new Set(["en", "fr", "es", "pt", "de", "ja", "ar", "zh"]);

function alreadyWritten(userId: string, locale: string): boolean {
  try {
    return sessionStorage.getItem(`juno.lang.${userId}`) === locale;
  } catch {
    // Private mode / storage disabled — fall through and write. An extra
    // update is harmless; a thrown exception here would not be.
    return false;
  }
}

function remember(userId: string, locale: string): void {
  try {
    sessionStorage.setItem(`juno.lang.${userId}`, locale);
  } catch {
    /* storage unavailable — the write still happened, we just repeat it later */
  }
}

export function PreferredLanguageSync() {
  const locale = useLocale();

  useEffect(() => {
    if (!SUPPORTED.has(locale)) return;

    let cancelled = false;

    const sync = async (userId: string | undefined) => {
      if (!userId || cancelled) return;
      if (alreadyWritten(userId, locale)) return;

      try {
        const supabase = getSupabaseBrowser();
        const { error } = await supabase
          .from("profiles")
          .update({ preferred_language: locale })
          .eq("id", userId);

        if (!error && !cancelled) remember(userId, locale);
      } catch {
        /* best effort — never surface to the reader */
      }
    };

    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = getSupabaseBrowser();

      // Current session, if the page loaded with one.
      supabase.auth
        .getSession()
        .then(({ data }) => sync(data.session?.user?.id))
        .catch(() => {});

      // And again right after a sign-in, which is the first moment we know
      // who the reader is.
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        void sync(session?.user?.id);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Supabase env vars missing (e.g. a preview build) — do nothing.
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [locale]);

  return null;
}
