import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';

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

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#e94560',
        tabBarInactiveTintColor: '#666',
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
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: t('matches'),
          headerTitle: `💫 ${t('yourMatches')}`,
          tabBarIcon: ({ focused }) => <TabIcon emoji="💫" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('chat'),
          headerTitle: `💬 ${t('messages')}`,
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          headerTitle: t('myChart'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="⭐" focused={focused} />,
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
