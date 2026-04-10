import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingState } from '../../components/ScreenStates';
import WebTabWrapper from '../../components/WebTabWrapper';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { formatCompactTime } from '../../utils/dateFormatting';
import { DEFAULT_PROFILE_IMAGE, resolveProfileImage } from '../../utils/profileImages';

const ICEBREAKER_KEYS = [
  'icebreakerAstro1',
  'icebreakerAstro2',
  'icebreakerAstro3',
  'icebreakerAstro4',
  'icebreakerAstro5',
];

type Conversation = {
  match_id: string;
  other_user: {
    id: string;
    name: string;
    image_url?: string | null;
    photos?: Array<string | null>;
    images?: Array<string | null>;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (user) {
      loadConversations();
      const unsubscribe = subscribeToNewMessages();
      return unsubscribe;
    }
    if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConversations = async () => {
    setLoading(true);
    setLoadError(null);

    // 1. Fetch all matches in one query
    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user?.id},user2_id.eq.${user?.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (matchError) {
      console.error('Error loading conversations:', matchError);
      setLoadError(t('loadingFailed') || 'Failed to load conversations. Please try again.');
      setLoading(false);
      return;
    }

    if (!matches || matches.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const otherUserIds = matches.map((m) =>
      m.user1_id === user?.id ? m.user2_id : m.user1_id
    );
    const matchIds = matches.map((m) => m.id);

    // 2. Batch fetch: profiles, last messages, and unread counts in parallel (~3 queries)
    const [profilesResult, messagesResult, unreadResult] = await Promise.all([
      // Fetch all other user profiles in one query
      supabase
        .from('discoverable_profiles')
        .select('*')
        .in('id', otherUserIds),
      // Fetch recent messages for all matches in one query (sorted newest first)
      supabase
        .from('messages')
        .select('*')
        .in('match_id', matchIds)
        .order('created_at', { ascending: false }),
      // Fetch all unread messages in one query
      supabase
        .from('messages')
        .select('match_id')
        .in('match_id', matchIds)
        .eq('read', false)
        .neq('sender_id', user?.id),
    ]);

    // 3. Build lookup maps in JS
    const profileMap = new Map<string, any>();
    (profilesResult.data || []).forEach((p) => profileMap.set(p.id, p));

    // Keep only the most recent message per match_id (already sorted newest first)
    const lastMessageMap = new Map<string, any>();
    (messagesResult.data || []).forEach((msg) => {
      if (!lastMessageMap.has(msg.match_id)) {
        lastMessageMap.set(msg.match_id, msg);
      }
    });

    // Count unread messages per match_id
    const unreadCountMap = new Map<string, number>();
    (unreadResult.data || []).forEach((msg) => {
      unreadCountMap.set(msg.match_id, (unreadCountMap.get(msg.match_id) || 0) + 1);
    });

    // 4. Assemble conversation data from maps
    const conversationsData: Conversation[] = matches.map((match) => {
      const otherUserId = match.user1_id === user?.id ? match.user2_id : match.user1_id;
      return {
        match_id: match.id,
        other_user: profileMap.get(otherUserId) || {
          id: otherUserId,
          name: t('unknown'),
          image_url: DEFAULT_PROFILE_IMAGE,
          sun_sign: '?',
        },
        last_message: lastMessageMap.get(match.id) || null,
        unread_count: unreadCountMap.get(match.id) || 0,
      };
    });

    conversationsData.sort((a, b) => {
      if (!a.last_message && !b.last_message) return 0;
      if (!a.last_message) return 1;
      if (!b.last_message) return -1;
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
    });

    setConversations(conversationsData);
    setLoading(false);
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscribeToNewMessages = () => {
    const debouncedReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => loadConversations(), 800);
    };

    const subscription = supabase
      .channel('chat-list-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        debouncedReload
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        debouncedReload
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      subscription.unsubscribe();
    };
  };

  const formatTime = (dateString: string) => formatCompactTime(dateString, t('now'));

  const handleConversationPress = (conversation: Conversation) => {
    router.push(`/chat/${conversation.match_id}`);
  };

  // Pick a stable icebreaker per conversation (based on match_id hash)
  const getIcebreaker = useCallback((matchId: string) => {
    let hash = 0;
    for (let i = 0; i < matchId.length; i++) {
      hash = ((hash << 5) - hash) + matchId.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % ICEBREAKER_KEYS.length;
    return t(ICEBREAKER_KEYS[idx]);
  }, [t]);

  function ConversationRow({ conversation }: { conversation: Conversation }) {
    const isUnread = conversation.unread_count > 0;
    const isFromMe = conversation.last_message?.sender_id === user?.id;
    const isNewMatch = !conversation.last_message;

    return (
      <TouchableOpacity
        style={[styles.conversationRow, isNewMatch && styles.conversationRowNew]}
        onPress={() => handleConversationPress(conversation)}
      >
        <View style={styles.avatarContainer}>
          <Image source={{ uri: resolveProfileImage(conversation.other_user) }} style={styles.avatar} />
          {isUnread ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{conversation.unread_count}</Text>
            </View>
          ) : null}
          {isNewMatch ? (
            <View style={styles.newMatchDot} />
          ) : null}
        </View>

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={styles.conversationName}>{conversation.other_user.name}</Text>
            {conversation.last_message ? (
              <Text style={styles.timestamp}>{formatTime(conversation.last_message.created_at)}</Text>
            ) : (
              <Text style={styles.newMatchLabel}>{t('newMatch') || 'New'}</Text>
            )}
          </View>

          {conversation.last_message ? (
            <Text
              style={[styles.lastMessage, isUnread && styles.unreadMessage]}
              numberOfLines={1}
            >
              {isFromMe ? `${t('you')} ` : ''}
              {conversation.last_message.content}
            </Text>
          ) : (
            <View>
              <Text style={styles.noMessages}>{'\u2728'} {t('sendFirstMessagePrompt') || 'Break the ice and say hello'}</Text>
              <Text style={styles.icebreakerSuggestion} numberOfLines={1}>
                {'\u{1F4A1}'} {getIcebreaker(conversation.match_id)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (authLoading || loading) {
    return (
      <WebTabWrapper>
        <LoadingState message={t('loadingConversations')} testID="chat-loading" />
      </WebTabWrapper>
    );
  }

  if (loadError) {
    return (
      <WebTabWrapper>
        <ErrorState
          title={t('error') || 'Something went wrong'}
          message={loadError}
          onRetry={loadConversations}
          retryLabel={t('refresh') || 'Try Again'}
          testID="chat-error"
        />
      </WebTabWrapper>
    );
  }

  return (
    <WebTabWrapper>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        {conversations.length > 0 ? (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.match_id}
            renderItem={({ item }) => <ConversationRow conversation={item} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            windowSize={10}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={
              <View style={styles.header} accessibilityRole="header">
                <View style={{ height: insets.top + 8 }} />
                <Text style={styles.headerTitle}>{t('messages')}</Text>
              </View>
            }
          />
        ) : (
          <EmptyState
            emoji={'\u{1F4AC}'}
            title={t('emptyChatTitle') || t('noConversations')}
            subtitle={t('emptyChatSubtitle') || t('matchToChatCosmos')}
            hint={t('emptyChatHint')}
            actionLabel={t('emptyChatCta') || t('findMatches')}
            onAction={() => router.push('/(tabs)/discover')}
            testID="chat-empty"
          />
        )}
      </LinearGradient>
    </WebTabWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  } as any,
  header: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
  },
  list: {
    paddingTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  conversationRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: AppTheme.radius.lg,
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    minHeight: 80,
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
    backgroundColor: AppTheme.colors.coral,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: AppTheme.colors.heroMid,
    paddingHorizontal: 4,
  },
  unreadText: {
    color: AppTheme.colors.textOnAccent,
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
    color: AppTheme.colors.textPrimary,
  },
  timestamp: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
  },
  lastMessage: {
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
  },
  unreadMessage: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '500',
  },
  noMessages: {
    fontSize: 15,
    color: AppTheme.colors.coral,
    fontStyle: 'italic',
  },
  separator: {
    height: 8,
  },
  conversationRowNew: {
    borderColor: 'rgba(124, 108, 255, 0.25)',
    backgroundColor: 'rgba(124, 108, 255, 0.06)',
  },
  newMatchDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: AppTheme.colors.panel,
  },
  newMatchLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22c55e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  icebreakerSuggestion: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 16,
  },
});
