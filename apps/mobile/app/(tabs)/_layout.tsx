import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { tabSwitch } from '../../services/haptics';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconFocused]}>
      <Text style={styles.icon}>{emoji}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const handleTabPress = () => {
    tabSwitch();
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'bottom',
        tabBarStyle: Platform.select({
          web: {
            backgroundColor: '#0f0f1a',
            borderTopColor: 'rgba(255, 255, 255, 0.1)',
            borderTopWidth: 1,
            height: 70,
            paddingBottom: 8,
            paddingTop: 8,
            position: 'fixed' as const,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
          },
          default: {
            backgroundColor: '#0f0f1a',
            borderTopColor: 'rgba(255, 255, 255, 0.1)',
            borderTopWidth: 1,
            height: 60 + insets.bottom,
            paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8,
            paddingTop: 8,
          },
        }),
        tabBarItemStyle: {
          flex: 1,
        },
        tabBarActiveTintColor: '#e94560',
        tabBarInactiveTintColor: '#888',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: t('discover') || 'Discover',
          tabBarIcon: ({ focused }) => <TabIcon emoji={'\u{1F50D}'} focused={focused} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: t('matches') || 'Matches',
          tabBarIcon: ({ focused }) => <TabIcon emoji={'\u{1F49E}'} focused={focused} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('chat') || 'Chat',
          tabBarIcon: ({ focused }) => <TabIcon emoji={'\u{1F4AC}'} focused={focused} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile') || 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji={'\u{1F464}'} focused={focused} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="premium"
        options={{
          title: t('premium') || 'Premium',
          tabBarIcon: ({ focused }) => <TabIcon emoji={'\u{2B50}'} focused={focused} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null,
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
    fontSize: 20,
  },
});
