-- Harden RLS on storage buckets used for user-generated uploads.
--
-- Target buckets:
--   - avatars          (public read)
--   - voice-intros     (public read)
--   - verifications    (private, owner-only read)
--
-- Goal: guarantee that every INSERT / UPDATE / DELETE on storage.objects for
-- these buckets has its top-level path prefix equal to the caller's auth.uid().
-- This defends against a malicious client submitting a path that points at
-- another user's folder even if the client-side code is compromised.
--
-- We purposefully re-create the policies (idempotent) to ensure the current
-- state matches what we expect — previous migrations may have left partial
-- policies behind (see 20260227000001_new_features.sql + 00000000000000_full_schema.sql).

begin;

-- =============================================================================
-- AVATARS (public read, owner-only write)
-- =============================================================================

DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;

CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatars"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatars"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- VOICE-INTROS (public read, owner-only write)
-- =============================================================================

DROP POLICY IF EXISTS "Users upload own voice intro" ON storage.objects;
DROP POLICY IF EXISTS "Users update own voice intro" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own voice intro" ON storage.objects;
DROP POLICY IF EXISTS "Public read voice intros" ON storage.objects;

CREATE POLICY "Public read voice intros"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voice-intros');

CREATE POLICY "Users upload own voice intro"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'voice-intros'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own voice intro"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'voice-intros'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'voice-intros'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own voice intro"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'voice-intros'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- VERIFICATIONS (owner-only read + write — sensitive PII)
-- =============================================================================

DROP POLICY IF EXISTS "Users upload own verification" ON storage.objects;
DROP POLICY IF EXISTS "Users view own verification" ON storage.objects;
DROP POLICY IF EXISTS "Users update own verification" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own verification" ON storage.objects;

CREATE POLICY "Users view own verification"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verifications'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users upload own verification"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'verifications'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own verification"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'verifications'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'verifications'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own verification"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'verifications'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ensure verifications bucket is private (not publicly listable / readable by URL).
UPDATE storage.buckets SET public = FALSE WHERE id = 'verifications';

commit;
