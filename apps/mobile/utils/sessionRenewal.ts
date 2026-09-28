// JUNO-06 PR B — the ONE bounded session-renewal attempt, shared.
//
// Extracted from the sync-entitlement client (PR A, merged as the private
// attemptSessionRenewal) because the tarot client needs the exact same
// primitive: on a 401, ask Supabase ONCE to refresh the session, then let the
// caller re-invoke with the client whose internal state Supabase has just
// updated. No caller ever stores or reads a token — the SDK owns them.
//
// Contract (identical for every caller):
//   * at most ONE refreshSession() per caller decision;
//   * true ONLY when Supabase returns neither an error nor a missing session
//     AND the session carries a non-empty access_token;
//   * false on error, missing session, missing/empty token, or throw —
//     the caller then fails closed ('unauthenticated'), never loops.
import { supabase } from '../services/supabase';

export async function attemptSessionRenewal(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return false;
    const token = data?.session?.access_token;
    return typeof token === 'string' && token.length > 0;
  } catch {
    return false;
  }
}
