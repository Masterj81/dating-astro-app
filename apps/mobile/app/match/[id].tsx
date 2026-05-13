import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Conversation-first product change: the legacy "/match/[id]" detail screen
 * (full synastry + unmatch UI tied to the old mutual-like flow) has been
 * retired. The route file is kept so existing surfaces still resolve:
 *
 *  - Push notifications still ship `data: { matchId }` payloads from the
 *    `notify_new_match` Postgres trigger and `apps/mobile/app/_layout.tsx`
 *    pushes `/match/<matchId>` from them. That backend deprecation lands in
 *    a later pass.
 *  - The chat header's "View profile" affordance pushes `/match/<profileId>`
 *    for back-compat with older builds.
 *
 * Canonical destination is the premium synastry screen, which already
 * accepts `profileId` and falls back to the candidate picker if the id
 * can't be resolved (e.g. when a matches.id is passed instead of a profile
 * UUID). If no id is provided we send the user to discover so they land
 * somewhere meaningful instead of a blank screen.
 */
export default function LegacyMatchRedirect() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const resolvedId = Array.isArray(id) ? id[0] : id;

  if (typeof resolvedId === 'string' && resolvedId.length > 0) {
    return <Redirect href={`/premium-screens/synastry?profileId=${resolvedId}` as any} />;
  }

  return <Redirect href="/(tabs)/discover" />;
}
