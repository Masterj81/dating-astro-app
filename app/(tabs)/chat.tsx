import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

type Conversation = {
  match_id: string;
  other_user: {
    id: string;
    name: string;
    image_url: string;
    sun_sign: string;
  };
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count: number;
};

export default function ChatListScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('chat'),
      headerTitle: `💬 ${t('messages')}`,
    });
  }, [navigation, language]);

  useEffect(() => {
    if (user) {
      loadConversations();
      subscribeToNewMessages();
    }
  }, [user]);

  const loadConversations = async () => {
    setLoading(true);

    // Get all matches
    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user?.id},user2_id.eq.${user?.id}`)
      .order('created_at', { ascending: false });

    if (matchError) {
      setLoading(false);
      return;
    }

    // For each match, get the other user's profile and last message
    const conversationsData = await Promise.all(
      (matches || []).map(async (match) => {
        const otherUserId = match.user1_id === user?.id ? match.user2_id : match.user1_id;

        // Get other user's profile
        const { data: profile } = await supabase
          .from('discoverable_profiles')
          .select('*')
          .eq('id', otherUserId)
          .maybeSingle();

        // Get last message
        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .eq('match_id', match.id)
          .order('created_at', { ascending: false })
          .limit(1);

        // Count unread messages
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('match_id', match.id)
          .eq('read', false)
          .neq('sender_id', user?.id);

        return {
          match_id: match.id,
          other_user: profile || {
            id: otherUserId,
            name: t('unknown'),
            image_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
            sun_sign: '?',
          },
          last_message: messages?.[0] || null,
          unread_count: count || 0,
        };
      })
    );

    // Sort by last message date (most recent first)
    conversationsData.sort((a, b) => {
      if (!a.last_message && !b.last_message) return 0;
      if (!a.last_message) return 1;
      if (!b.last_message) return -1;
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
    });

    setConversations(conversationsData);
    setLoading(false);
  };

  const subscribeToNewMessages = () => {
    const subscription = supabase
      .channel('chat-list-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          // Reload conversations when new message arrives
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('now');
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const handleConversationPress = (conversation: Conversation) => {
    router.push(`/chat/${conversation.match_id}`);
  };

  function ConversationRow({ conversation }: { conversation: Conversation }) {
    const isUnread = conversation.unread_count > 0;
    const isFromMe = conversation.last_message?.sender_id === user?.id;

    return (
      <TouchableOpacity
        style={styles.conversationRow}
        onPress={() => handleConversationPress(conversation)}
      >
        <View style={styles.avatarContainer}>
          <Image source={{ uri: conversation.other_user.image_url }} style={styles.avatar} />
          {isUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{conversation.unread_count}</Text>
            </View>
          )}
        </View>

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={styles.conversationName}>{conversation.other_user.name}</Text>
            {conversation.last_message && (
              <Text style={styles.timestamp}>{formatTime(conversation.last_message.created_at)}</Text>
            )}
          </View>

          {conversation.last_message ? (
            <Text
              style={[styles.lastMessage, isUnread && styles.unreadMessage]}
              numberOfLines={1}
            >
              {isFromMe ? t('you') + ' ' : ''}{conversation.last_message.content}
            </Text>
          ) : (
            <Text style={styles.noMessages}>
              {t('newMatch')}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>{t('loadingConversations')}</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      {conversations.length > 0 ? (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.match_id}
          renderItem={({ item }) => <ConversationRow conversation={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyTitle}>{t('noConversations')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('matchToChatCosmos')}
          </Text>
          <TouchableOpacity
            style={styles.discoverButton}
            onPress={() => router.push('/(tabs)/discover')}
          >
            <Text style={styles.discoverButtonText}>{t('findMatches')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  list: {
    paddingVertical: 8,
  },
  conversationRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#e94560',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a1a2e',
    paddingHorizontal: 4,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  timestamp: {
    fontSize: 13,
    color: '#666',
  },
  lastMessage: {
    fontSize: 15,
    color: '#888',
  },
  unreadMessage: {
    color: '#fff',
    fontWeight: '500',
  },
  noMessages: {
    fontSize: 15,
    color: '#e94560',
    fontStyle: 'italic',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 90,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  discoverButton: {
    backgroundColor: '#e94560',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
