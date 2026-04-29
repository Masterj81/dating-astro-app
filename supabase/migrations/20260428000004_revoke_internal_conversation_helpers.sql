-- Internal conversation-first trigger helpers should not be callable as
-- public RPCs. They are SECURITY DEFINER only because they run from triggers
-- inside the database.
--
-- Keep the client-facing RPCs exposed:
--   - public.get_or_create_conversation(UUID)
--   - public.get_user_conversations()
--
-- Revoke execute on the internal helper from every client role.

REVOKE EXECUTE ON FUNCTION public.update_conversation_last_message()
  FROM PUBLIC, anon, authenticated;
