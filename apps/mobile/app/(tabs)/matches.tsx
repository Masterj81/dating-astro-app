import { Redirect } from 'expo-router';

/**
 * Conversation-first product change: the legacy "Matches" tab is gone.
 * The screen file is kept so any deep link or `router.push('/(tabs)/matches')`
 * call left in old code paths or mobile shortcuts still resolves — it just
 * forwards the user to the conversation list.
 *
 * The full match list UI (compatibility scores, "see who liked you" banner,
 * unmatch action, etc.) lived here previously and was tied to the old
 * mutual-like flow. None of that has product meaning any more.
 */
export default function MatchesRedirectScreen() {
  return <Redirect href="/(tabs)/chat" />;
}
