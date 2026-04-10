-- Storage MIME strategy for mobile uploads (Android/iOS/web)
-- Phase 1 (active): permissive MIME to unblock production uploads and diagnostics.
-- Phase 2 (commented): stricter MIME whitelist once telemetry is stable.

begin;

-- ========================================
-- PHASE 1: DEBUG / UNBLOCK (ACTIVE)
-- ========================================
-- Removes MIME restrictions at bucket level.
-- RLS policies still apply (user can only upload in own folder).
update storage.buckets
set allowed_mime_types = null
where id in ('avatars', 'verifications', 'voice-intros');

-- Optional: ensure size limits are sane for current product behavior.
-- avatars: 5 MB, verifications: 50 MB, voice-intros: 5 MB
update storage.buckets
set file_size_limit = 5242880
where id = 'avatars';

update storage.buckets
set file_size_limit = 52428800
where id = 'verifications';

update storage.buckets
set file_size_limit = 5242880
where id = 'voice-intros';

commit;

-- ========================================
-- PHASE 2: HARDEN (MANUAL, LATER)
-- ========================================
-- Uncomment and run after collecting real-world MIME values from logs.
-- Suggested whitelist includes common Android/iOS variants.
--
-- begin;
--
-- update storage.buckets
-- set allowed_mime_types = array[
--   'image/jpeg',
--   'image/jpg',
--   'image/png',
--   'image/webp',
--   'image/heic',
--   'image/heif',
--   'application/octet-stream'
-- ]
-- where id = 'avatars';
--
-- update storage.buckets
-- set allowed_mime_types = array[
--   'video/mp4',
--   'video/quicktime',
--   'video/x-m4v',
--   'video/webm',
--   'application/octet-stream'
-- ]
-- where id = 'verifications';
--
-- update storage.buckets
-- set allowed_mime_types = array[
--   'audio/mpeg',
--   'audio/mp4',
--   'audio/aac',
--   'audio/m4a',
--   'audio/x-m4a',
--   'audio/wav',
--   'audio/ogg',
--   'application/octet-stream'
-- ]
-- where id = 'voice-intros';
--
-- commit;

