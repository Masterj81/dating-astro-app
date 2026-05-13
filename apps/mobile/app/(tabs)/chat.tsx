import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingState } from '../../components/ScreenStates';
import WebTabWrapper from '../../components/WebTabWrapper';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { listMyConversations, type ConversationListRow } from '../../services/conversations';
import { formatCompactTime } from '../../utils/dateFormatting';
import { DEFAULT_PROFILE_IMAGE, resolveProfileImage } from '../../utils/profileImages';

type Conversation = {
  conversation_id: string;
  other_user: {
    id: string;
    name: string;
    image_url?: string | null;
    sun_sign: string;
  };
  last_message: {
    content: string;
    created_at: string;
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

    try {
      const rows = await listMyConversations();

      const conversationsData: Conversation[] = rows.map((row: ConversationListRow) => ({
        conversation_id: row.conversation_id,
        other_user: {
          id: row.other_user_id,
          name: row.other_user_name || t('unknown'),
          image_url: row.other_user_image || DEFAULT_PROFILE_IMAGE,
          sun_sign: row.other_user_sun_sign || '?',
        },
        last_message: row.last_message
          ? {
              content: row.last_message,
              created_at: row.last_message_at || row.created_at || new Date().toISOString(),
            }
          : null,
        unread_count: Number(row.unread_count || 0),
      }));

      // Server already returns rows ordered by last_message_at desc, but
      // re-sorting client-side keeps the UX deterministic if anything new
      // arrived between fetch and render.
      conversationsData.sort((a, b) => {
        if (!a.last_message && !b.last_message) return 0;
        if (!a.last_message) return 1;
        if (!b.last_message) return -1;
        return (
          new Date(b.last_message.created_at).getTime() -
          new Date(a.last_message.created_at).getTime()
        );
      });

      setConversations(conversationsData);
    } catch (err: any) {
      console.error('Error loading conversations:', err);
      setLoadError(err?.message || t('loadingFailed') || 'Failed to load conversations. Please try again.');
    }

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
    router.push(`/chat/${conversation.conversation_id}`);
  };

  function ConversationRow({ conversation }: { conversation: Conversation }) {
    const isUnread = conversation.unread_count > 0;
    const isNewConversation = !conversation.last_message;
    const sunSign = conversation.other_user.sun_sign;
    const hasSign = sunSign && sunSign !== '?' && sunSign.trim().length > 0;

    return (
      <TouchableOpacity
        style={[styles.conversationRow, isNewConversation && styles.conversationRowNew]}
        onPress={() => handleConversationPress(conversation)}
      >
        <View style={styles.avatarContainer}>
          <Image source={{ uri: resolveProfileImage(conversation.other_user) }} style={styles.avatar} />
          {isUnread ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{conversation.unread_count}</Text>
            </View>
          ) : null}
          {isNewConversation ? (
            <View style={styles.newConversationDot} />
          ) : null}
        </View>

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={styles.conversationName} numberOfLines={1}>
              {conversation.other_user.name}
            </Text>
            {conversation.last_message ? (
              <Text style={styles.timestamp}>{formatTime(conversation.last_message.created_at)}</Text>
            ) : (
              <Text style={styles.newConversationLabel}>
                {t('chatRowNewLabel') || 'NEW'}
              </Text>
            )}
          </View>

          {hasSign ? (
            <Text style={styles.signContext} numberOfLines={1}>
              {sunSign}
            </Text>
          ) : null}

          {conversation.last_message ? (
            <Text
              style={[styles.lastMessage, isUnread && styles.unreadMessage]}
              numberOfLines={1}
            >
              {conversation.last_message.content}
            </Text>
          ) : (
            <Text style={styles.noMessages} numberOfLines={1}>
              {t('chatRowSayHello') || 'Say hello \u2014 the first message is free.'}
            </Text>
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
            keyExtractor={(item) => item.conversation_id}
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
                <Text style={styles.headerTitle}>{t('chatInboxTitle') || t('messages')}</Text>
              </View>
            }
          />
        ) : (
          <EmptyState
            emoji=""
            title={t('emptyChatTitle') || 'No conversations yet'}
            subtitle={t('emptyChatSubtitle') || 'Start with a profile, a prompt, or an icebreaker. The first message is free.'}
            actionLabel={t('emptyChatCta') || 'Discover people'}
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
  newConversationDot: {
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
  newConversationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22c55e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  signContext: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.2,
  },
});
