-- Remove super_likes feature.
--
-- Conversation-first product direction: super-likes were marketed but never
-- actually shipped (no UI button, no swipe insert path, no notification
-- trigger, no visibility boost). The `premium_feature_policy` row for
-- `super_likes` is the only piece of this dead feature that lives in the
-- database. Drop it.
--
-- We intentionally do NOT touch:
--   - the `swipes.action` CHECK constraint that still allows 'super_like'
--     (no rows ever inserted; dead enum branch is harmless and dropping it
--     would require rewriting historical migrations)
--   - the like-counting triggers that include 'super_like' in their
--     conditions (same reasoning — dead branch, zero matching rows)
--   - the `idx_swipes_likes` partial index condition (same)

begin;

DELETE FROM public.premium_feature_policy
 WHERE feature_key = 'super_likes';

commit;
