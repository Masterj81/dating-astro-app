import { Redirect } from 'expo-router';

export default function TabsIndex() {
  // Redirect to discover tab
  return <Redirect href="/(tabs)/discover" />;
}
