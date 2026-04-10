import React from 'react';
import { Tabs } from 'expo-router';
import { MotiView } from 'moti';
import { Platform, StyleSheet, Text, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { tabSwitch } from '../../services/haptics';

const TabIcon = React.memo(function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <MotiView
      style={styles.iconContainer}
      animate={{
        backgroundColor: focused ? 'rgba(233, 69, 96, 0.2)' : 'transparent',
        scale: focused ? 1.1 : 1,
      }}
      transition={{ type: 'timing', duration: 200 }}
    >
      <Text style={styles.icon}>{emoji}</Text>
    </MotiView>
  );
});

export default function TabsLayout() {
  const { t, version } = useLanguage();
  const insets = useSafeAreaInsets();

  const handleTabPress = () => {
    tabSwitch();
  };

  const tabBarStyle: ViewStyle = {
    backgroundColor: '#0f0f1a',
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    borderTopWidth: 1,
    height: Platform.OS === 'web' ? 70 : 60 + insets.bottom,
    paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8,
    paddingTop: 8,
    ...(Platform.OS === 'web'
      ? {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
        }
      : {}),
  };

  return (
    <Tabs
      key={`tabs-lang-${version}`}
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'bottom',
        tabBarStyle,
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
  icon: {
    fontSize: 20,
  },
});
