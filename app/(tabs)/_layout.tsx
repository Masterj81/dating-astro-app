import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { tabSwitch } from '../../services/haptics';
import { a11yColors } from '../../utils/accessibility';

// Simple icon component using emoji (replace with proper icons later)
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconFocused]}>
      <Text style={[styles.icon, focused && styles.iconTextFocused]}>{emoji}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // Calculate tab bar height with safe area
  const tabBarHeight = 60 + (Platform.OS === 'android' ? insets.bottom : 0);

  // Handle tab press with haptic feedback
  const handleTabPress = () => {
    tabSwitch();
  };

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: a11yColors.background.primary,
        },
        headerTintColor: a11yColors.text.primary,
        headerTitleStyle: {
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: a11yColors.background.primary,
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: Platform.OS === 'android' ? insets.bottom + 8 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: a11yColors.interactive.primary,
        tabBarInactiveTintColor: a11yColors.text.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t('discover'),
          headerTitle: `✦ ${t('discover')}`,
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔮" focused={focused} />,
          tabBarAccessibilityLabel: t('a11y.discoverTab'),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: t('matches'),
          headerTitle: `💫 ${t('yourMatches')}`,
          tabBarIcon: ({ focused }) => <TabIcon emoji="💫" focused={focused} />,
          tabBarAccessibilityLabel: t('a11y.matchesTab'),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('chat'),
          headerTitle: `💬 ${t('messages')}`,
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
          tabBarAccessibilityLabel: t('a11y.chatTab'),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          headerTitle: t('myChart'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="⭐" focused={focused} />,
          tabBarAccessibilityLabel: t('a11y.profileTab'),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconFocused: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
  },
  icon: {
    fontSize: 18,
    opacity: 0.6,
  },
  iconTextFocused: {
    opacity: 1,
  },
});
