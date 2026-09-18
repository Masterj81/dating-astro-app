-- Reschedule the daily profiles PII posture watchdog.
--
-- WHY (JUNO-15, diagnosed 2026-09-18): 20260903000004 created
-- public.record_profiles_pii_posture() and tried to schedule
-- 'profiles-pii-posture' at '17 3 * * *' — inside a block that swallowed its
-- own failure (EXCEPTION WHEN OTHERS THEN RAISE NOTICE), the exact JUNO-29
-- anti-pattern. The audit of 2026-09-18 measured the real state: the table,
-- both functions and the check itself exist and report ok=true, but the job
-- is ABSENT from cron.job — the daily posture watch has never run.
--
-- This migration is deliberately fail-closed: if pg_cron is unreachable, or
-- the schedule does not exist, active, and targeting the watchdog AFTER the
-- call, the transaction RAISES and rolls back. No swallowed NOTICE. The
-- validator scripts/validate-migration-history.mjs (R4) exists so this shape
-- is the only one future cron migrations may take.
--
-- STATUS: file created 2026-09-18 as part of JUNO-15 — NOT APPLIED until the
-- operator runs it (Management API), per docs/runbooks/migration-reconciliation-2026-09.md.

begin;

DO $$
BEGIN
  -- Preconditions: refuse rather than half-apply.
  IF to_regprocedure('cron.schedule(text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'cron.schedule(text, text, text) introuvable — pg_cron indisponible ?';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_profiles_pii_posture'
  ) THEN
    RAISE EXCEPTION 'public.record_profiles_pii_posture() introuvable — 20260903000004 non appliqué';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'security_posture_alerts'
  ) THEN
    RAISE EXCEPTION 'public.security_posture_alerts introuvable — 20260903000004 non appliqué';
  END IF;

  -- Idempotent by name: replace any leftover job with the same name.
  PERFORM cron.unschedule('profiles-pii-posture')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'profiles-pii-posture');

  PERFORM cron.schedule(
    'profiles-pii-posture',
    '17 3 * * *',
    $cron$SELECT public.record_profiles_pii_posture();$cron$
  );

  -- POSTCONDITION: the watchdog is scheduled, active, and runs the real
  -- function. If any of this is false the whole migration rolls back —
  -- a NOTICE here would repeat the 20260903000004 miss.
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'profiles-pii-posture'
      AND schedule = '17 3 * * *'
      AND active
      AND position('record_profiles_pii_posture' in command) > 0
  ) THEN
    RAISE EXCEPTION 'postcondition échouée : profiles-pii-posture absent/inactif après cron.schedule';
  END IF;
END
$$;

commit;
