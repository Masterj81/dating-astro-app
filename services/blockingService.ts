import { supabase } from './supabase';

export type ReportReason =
  | 'inappropriate_photos'
  | 'harassment'
  | 'spam'
  | 'fake_profile'
  | 'underage'
  | 'other';

export interface BlockedUser {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason?: string;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  description?: string;
  status: string;
  created_at: string;
}

/**
 * Block a user
 */
export async function blockUser(
  blockerId: string,
  blockedId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Insert block record
    const { error: blockError } = await supabase
      .from('blocked_users')
      .insert({
        blocker_id: blockerId,
        blocked_id: blockedId,
        reason,
      });

    if (blockError) {
      if (blockError.code === '23505') {
        return { success: false, error: 'User already blocked' };
      }
      if (blockError.message?.includes('rate limit')) {
        return { success: false, error: 'Too many blocks. Please try again later.' };
      }
      throw blockError;
    }

    // Update any existing match to blocked status
    await supabase
      .from('matches')
      .update({ status: 'blocked' })
      .or(`and(user1_id.eq.${blockerId},user2_id.eq.${blockedId}),and(user1_id.eq.${blockedId},user2_id.eq.${blockerId})`);

    return { success: true };
  } catch (error) {
    console.error('Error blocking user:', error);
    return { success: false, error: 'Failed to block user' };
  }
}

/**
 * Unblock a user
 */
export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error unblocking user:', error);
    return { success: false, error: 'Failed to unblock user' };
  }
}

/**
 * Check if a user is blocked
 */
export async function isUserBlocked(
  blockerId: string,
  blockedId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error('Error checking block status:', error);
    return false;
  }
}

/**
 * Get list of blocked users
 */
export async function getBlockedUsers(userId: string): Promise<BlockedUser[]> {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select(`
        id,
        blocker_id,
        blocked_id,
        reason,
        created_at,
        blocked:profiles!blocked_id (
          id,
          name,
          photos,
          sun_sign
        )
      `)
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting blocked users:', error);
    return [];
  }
}

/**
 * Report a user
 */
export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('reports')
      .insert({
        reporter_id: reporterId,
        reported_id: reportedId,
        reason,
        description,
        status: 'pending',
      });

    if (error) {
      if (error.message?.includes('rate limit')) {
        return { success: false, error: 'Too many reports. Please try again later.' };
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error reporting user:', error);
    return { success: false, error: 'Failed to submit report' };
  }
}

/**
 * Unmatch with a user (soft delete - changes status)
 */
export async function unmatchUser(
  userId: string,
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('matches')
      .update({ status: 'unmatched' })
      .eq('id', matchId)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error unmatching user:', error);
    return { success: false, error: 'Failed to unmatch' };
  }
}
