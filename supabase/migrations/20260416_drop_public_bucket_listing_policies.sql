-- Security fix: drop broad SELECT policies on storage.objects for public buckets.
-- Public buckets serve files via /storage/v1/object/public/<bucket>/<path> without RLS.
-- A broad `FOR SELECT USING (bucket_id = 'X')` policy lets clients call storage.list()
-- and enumerate every file in the bucket — exposing more data than intended.
--
-- Linter ref: 0025_public_bucket_allows_listing
-- Affected buckets: avatars, marketing-images, tarot, voice-intros

begin;

-- Avatars
DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow public viewing 1oj01fe_0" ON storage.objects;

-- Marketing images
DROP POLICY IF EXISTS "Allow public viewing marketing-images" ON storage.objects;

-- Tarot
DROP POLICY IF EXISTS "Allow public viewing tarot" ON storage.objects;

-- Voice intros
DROP POLICY IF EXISTS "Public read voice intros" ON storage.objects;
DROP POLICY IF EXISTS "Allow public viewing voice-intros" ON storage.objects;

-- Note: the dashboard-created policy "Allow public viewing 1oj01fe_0" is unique per bucket
-- in storage.objects but Postgres allows the same policy name on different bucket conditions.
-- The DROP above removes the avatars copy. Below: explicit drops for the other buckets'
-- copies (Postgres uses (policyname, tablename) as the unique key, so multiple rows with
-- the same name across different USING clauses can exist if previously created via
-- different mechanisms; iterate to be safe).
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'SELECT'
      AND (
        policyname ILIKE 'allow public viewing%'
        OR policyname ILIKE 'public read%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END;
$$;

commit;
