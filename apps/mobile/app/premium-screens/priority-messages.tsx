import { Redirect } from 'expo-router';

// Conversation-first product change: "priority messages" was a fully mocked
// surface (hardcoded Luna/Stella personas, no DB binding) and messaging is
// free for everyone now, so there is nothing real to gate. This stub stays
// so any lingering deep link lands on the premium hub instead of 404'ing.
export default function PriorityMessagesScreen() {
  return <Redirect href={'/(tabs)/premium' as any} />;
}
