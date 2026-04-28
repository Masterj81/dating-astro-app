import { supabase } from './supabase';

/**
 * Conversation-first messaging entrypoint.
 *
 * Server-side guard rails (see migration 20260428000001):
 *   - SECURITY DEFINER RPC `get_or_create_conversation` enforces
 *     auth.uid() server-side, refuses self-conversations, refuses if
 *     either side has blocked the other, and rate limits new
 *     conversations per user.
 *   - The conversations table denies direct INSERT via RLS so callers
 *     MUST go through this RPC.
 *
 * Returns the conversation id. The caller can then navigate to the
 * chat screen for that id and start composing.
 */
export async function startConversationWith(
  targetUserId: string
): Promise<string> {
  if (!targetUserId) {
    throw new Error('Missing target user');
  }

  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    target_user_id: targetUserId,
  });

  if (error) {
    // The RPC raises Postgres errors with codes that map to product
    // states; pass them through with a friendly message so callers can
    // toast them directly.
    const message = error.message || 'Could not start conversation.';
    throw new Error(message);
  }

  if (!data) {
    throw new Error('Could not start conversation.');
  }

  // RPC returns the UUID directly (RETURNS UUID).
  return String(data);
}

export type ConversationListRow = {
  conversation_id: string;
  other_user_id: string;
  other_user_name: string | null;
  other_user_image: string | null;
  other_user_sun_sign: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string | null;
  unread_count: number | null;
};

export async function listMyConversations(): Promise<ConversationListRow[]> {
  const { data, error } = await supabase.rpc('get_user_conversations');
  if (error) {
    throw new Error(error.message || 'Could not load conversations.');
  }
  return (data as ConversationListRow[]) || [];
}
