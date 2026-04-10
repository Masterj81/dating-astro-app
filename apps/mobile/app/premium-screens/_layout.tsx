import { Stack } from 'expo-router';
import { Platform, ViewStyle } from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';

export default function PremiumLayout() {
  const { version } = useLanguage();
  const webContentStyle: any = Platform.OS === 'web' ? {
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 60px)', // Account for fixed bottom tab bar
    width: '100%',
    overflow: 'hidden',
  } : {};

  return (
    <Stack
      key={`premium-lang-${version}`}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: {
          flex: 1,
          backgroundColor: '#0f0f1a',
          ...webContentStyle,
        } as ViewStyle,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="plans" />
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
      <Stack.Screen name="date-planner" />
      <Stack.Screen name="tarot" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
