import { Redirect } from 'expo-router';

// Conversation-first product change: the "who liked you" feed has no real
// backend signal — it was reading from the `swipes` table which no longer
// reflects a meaningful product action. The surface was retired in the
// premium catalog and in `FEATURE_TIERS`. This stub stays so any lingering
// deep link (push notification, old web bookmark) lands on the premium hub
// instead of 404'ing.
export default function LikesScreen() {
  return <Redirect href={'/(tabs)/premium' as any} />;
}
