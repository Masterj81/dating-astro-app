import { Stack } from 'expo-router';
import { AppTheme } from '../../constants/theme';

export default function WelcomeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: AppTheme.colors.canvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="preview" />
    </Stack>
  );
}
