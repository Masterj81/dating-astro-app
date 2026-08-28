-- Store the language each account reads in, so server-sent email can be
-- written in it.
--
-- Why this exists
-- ---------------
-- JUNO ships 8 locales in both apps, but every lifecycle email is English.
-- That is not a translation backlog — it is a data gap: the backend has no
-- record of what language anyone reads. `LanguageContext` (mobile) keeps the
-- choice in AsyncStorage and never sends it; the web derives it from the URL
-- and never persists it. A browser announces its language in Accept-Language,
-- which is how the unsubscribe page localises itself; an email has no
-- equivalent, so the sender must know in advance.
--
-- This migration only captures the value. Localising the templates is a
-- separate change and is pointless until this column is populated — see
-- docs/retention-day2-audit-2026-08.md.
--
-- Design notes
-- ------------
--   * NULL is the normal state for every existing row and means "unknown".
--     Senders fall back to English. There is deliberately no DEFAULT: a
--     default would assert a language nobody chose, and 'en' is already the
--     fallback, so a default would only make "unknown" indistinguishable from
--     "chose English".
--   * The CHECK mirrors the locale list in apps/web/src/i18n/routing.ts and
--     apps/mobile/services/i18n.ts. scripts/validate-locale-contract.mjs fails
--     the build if the three drift apart.
--   * No new RLS policy: "Users can update own profile"
--     (00000000000000_full_schema.sql:377) already scopes writes to
--     auth.uid() = id, which is the same path notification_preferences uses.
--     The CHECK is what stops a client writing nonsense into the column.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT;

-- Idempotent: re-running the migration must not fail on an existing constraint.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_language_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_language_check
  CHECK (
    preferred_language IS NULL
    OR preferred_language IN ('en', 'fr', 'es', 'pt', 'de', 'ja', 'ar', 'zh')
  );

COMMENT ON COLUMN public.profiles.preferred_language IS
  'BCP-47 base language the account reads in, one of the 8 shipped locales. NULL = unknown; senders fall back to English. Written by the apps when the language is known or changed. Kept in sync with apps/web/src/i18n/routing.ts and apps/mobile/services/i18n.ts — see scripts/validate-locale-contract.mjs.';

COMMIT;
