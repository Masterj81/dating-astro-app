import { Stack } from 'expo-router';

export default function PremiumLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="plus" />
      <Stack.Screen name="natal-chart" />
      <Stack.Screen name="daily-horoscope" />
      <Stack.Screen name="monthly-horoscope" />
      <Stack.Screen name="planetary-transits" />
      <Stack.Screen name="retrograde-alerts" />
      <Stack.Screen name="lucky-days" />
      <Stack.Screen name="synastry" />
      <Stack.Screen name="likes" />
      <Stack.Screen name="super-likes" />
      <Stack.Screen name="priority-messages" />
    </Stack>
  );
}
