-- Security fix: re-enable strict MIME type validation on storage buckets.
-- Reverts the permissive "Phase 1" from 20260310 migration.

begin;

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]
where id = 'avatars';

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm'
]
where id = 'verifications';

update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/ogg'
]
where id = 'voice-intros';

commit;
