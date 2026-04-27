-- Close the missing REVOKE on _load_cron_secret.
-- The original migration (20260419000005_rotate_cron_secrets.sql) revoked
-- EXECUTE from authenticated but not from anon — a literal oversight.
-- Audit on 2026-04-27 confirmed _load_cron_secret still has anon=X/postgres.

REVOKE EXECUTE ON FUNCTION public._load_cron_secret(TEXT, TEXT)
  FROM PUBLIC, anon;
