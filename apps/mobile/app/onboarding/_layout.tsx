import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: '#0B0B14',
        },
      }}
    >
      <Stack.Screen name="birth-info" />
    </Stack>
  );
}