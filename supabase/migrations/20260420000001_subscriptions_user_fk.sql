-- P1-1 — FK audit: ensure every user-scoped table cascades on auth.users delete.
--
-- Inventory (from existing schema):
--   profiles.id                    → auth.users(id) ON DELETE CASCADE  ✓ (00000000000000_full_schema.sql:113)
--   subscriptions.user_id          → auth.users(id) ON DELETE CASCADE  ✓ (20260302_web_subscriptions.sql:4)
--   subscription_events.user_id    → auth.users(id) ON DELETE CASCADE  ✓ (20260312_unified_subscriptions.sql:131)
--   premium_usage.user_id          → auth.users(id) ON DELETE CASCADE  ✓ (00000000000000_full_schema.sql:310)
--   deletion_requests.user_id      → auth.users(id) ON DELETE CASCADE  ✓ (00000000000000_full_schema.sql:338)
--   promo_campaign_redemptions.user_id → auth.users(id) ON DELETE CASCADE ✓ (full schema + 20260325_add_promo_campaign_redemptions.sql)
--   referral_redemptions.referrer_id/referee_id → auth.users(id) ON DELETE CASCADE ✓ (20260330_referral_system.sql)
--   profiles.referred_by           → auth.users(id) (no cascade — intentional, weak link)
--   scheduled_emails.user_id       → auth.users(id) ON DELETE CASCADE  ✓ (20260329_onboarding_email_sequence.sql:5)
--   swipes, matches, messages, blocked_users, reports → profiles(id) ON DELETE CASCADE, and profiles cascades from auth.users → transitively OK.
--
-- This migration is a belt-and-suspenders: for any table that ended up without
-- the intended FK (e.g. because schema drift happened in prod), it re-applies
-- the constraint, and archives any orphan rows first. It is idempotent.
--
-- We do NOT drop any existing FK — we only add missing ones.

BEGIN;

-- subscriptions_archive already defined in 20260312_unified_subscriptions.sql.
-- Use it as the canonical orphan audit log, adding a new reason where needed.

DO $$
DECLARE
  v_orphan_count BIGINT;
BEGIN
  -- subscriptions
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'subscriptions'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES auth.users%ON DELETE CASCADE%'
  ) THEN
    RAISE NOTICE 'subscriptions FK to auth.users(id) ON DELETE CASCADE already present, skipping.';
  ELSE
    SELECT COUNT(*) INTO v_orphan_count
      FROM public.subscriptions s
     WHERE s.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id);

    IF v_orphan_count > 0 THEN
      INSERT INTO public.subscriptions_archive (
        original_id, user_id, stripe_customer_id, stripe_subscription_id,
        tier, status, expires_at, cancel_at_period_end,
        created_at, updated_at, archive_reason
      )
      SELECT s.id, s.user_id, s.stripe_customer_id, s.stripe_subscription_id,
             s.tier, s.status, s.expires_at, s.cancel_at_period_end,
             s.created_at, s.updated_at, 'orphan_cleanup'
        FROM public.subscriptions s
       WHERE s.user_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
      ON CONFLICT (original_id) DO NOTHING;

      DELETE FROM public.subscriptions s
       WHERE s.user_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id);

      RAISE NOTICE 'Archived and removed % orphan subscriptions rows before adding FK.', v_orphan_count;
    END IF;

    ALTER TABLE public.subscriptions
      ADD CONSTRAINT fk_subscriptions_user_id
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Belt-and-suspenders for the other user-scoped tables: if the FK is somehow
-- missing in prod, add it; otherwise this block is a no-op.
DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'subscription_events',
    'premium_usage',
    'deletion_requests',
    'promo_campaign_redemptions',
    'scheduled_emails'
  ];
  v_table TEXT;
  v_has_fk BOOLEAN;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = v_table
        AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES auth.users%ON DELETE CASCADE%'
    ) INTO v_has_fk;

    IF NOT v_has_fk THEN
      -- Delete orphans (these tables don't have a dedicated archive — we log to NOTICE).
      EXECUTE format(
        'DELETE FROM public.%I WHERE user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = %I.user_id)',
        v_table, v_table
      );
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT fk_%I_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
        v_table, v_table
      );
      RAISE NOTICE 'Added missing FK on %.user_id', v_table;
    END IF;
  END LOOP;
END $$;

COMMIT;
