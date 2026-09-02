import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRisingTrustworthy } from '@astro/shared/astrology';
import { resolveCoachSign } from '@astro/shared/coach';
import BlockReportMenu from '../../components/BlockReportMenu';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { formatMessageTime } from '../../utils/dateFormatting';
import { DEFAULT_PROFILE_IMAGE, resolveProfileImage } from '../../utils/profileImages';
import { throttleAction } from '../../utils/rateLimit';
import { withRetry } from '../../utils/retry';
import { useAuth } from '../../contexts/AuthContext';
import { dismissMessageNotificationsForChat } from '../../services/notifications';

type Message = {
  id: string;
  conversation_id?: string | null;
  match_id?: string | null;
  sender_id: string;
  content: string;
  created_at: string;
  is_read?: boolean;
  read?: boolean;
  // P2-4: UI-only status for optimistic/pending messages.
  // Server-fetched messages have undefined pendingStatus and behave as before.
  pendingStatus?: 'sending' | 'failed';
  // Client-generated temp id so we can reconcile when the real row arrives
  // via the realtime subscription.
  clientId?: string;
};

// In conversation-first messaging, the route id is now a conversation id.
// We keep the variable name `conversationId` everywhere internally; the
// match concept has no remaining product meaning.
type ConversationInfo = {
  id: string;
  user_a: string;
  user_b: string;
  other_user: {
    id: string;
    name: string;
    age?: number | null;
    image_url?: string | null;
    photos?: Array<string | null>;
    images?: Array<string | null>;
    sun_sign: string;
    moon_sign?: string | null;
    rising_sign?: string | null;
  };
};

export default function ChatScreen() {
  const { id: conversationId, prefill: prefillParam } = useLocalSearchParams<{
    id: string;
    prefill?: string | string[];
  }>();
  const initialPrefill = Array.isArray(prefillParam) ? prefillParam[0] : prefillParam;
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState(initialPrefill ?? '');
  const [hasPrefill, setHasPrefill] = useState(Boolean(initialPrefill && initialPrefill.length > 0));
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationInfo, setConversationInfo] = useState<ConversationInfo | null>(null);
  const flatListRef = useRef<FlatList>(null);
  // Q-L2: guard setState calls from the realtime subscription against writes
  // after unmount (can happen while the channel is still draining).
  const isMountedRef = useRef(true);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const markMessagesAsRead = useCallback(async () => {
    if (!conversationId || !user) return;
    try {
      const { error } = await supabase.rpc('mark_conversation_messages_read', {
        p_conversation_id: conversationId,
      });
      if (error) throw error;

      setMessages((prev) =>
        prev.map((message) =>
          message.sender_id !== user.id && !message.is_read
            ? { ...message, is_read: true }
            : message
        )
      );
      await dismissMessageNotificationsForChat(conversationId);
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  }, [conversationId, user]);

  useEffect(() => {
    if (conversationId && user) {
      loadConversationInfo();
      loadMessages();
      const unsubscribe = subscribeToMessages();
      return () => { unsubscribe(); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [conversationId, user]);

  // Mark messages as read when screen comes into focus (e.g. returning from background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        markMessagesAsRead();
      }
    });
    return () => subscription.remove();
  }, [markMessagesAsRead]);

  const loadConversationInfo = async () => {
    try {
      const { data: conv, error } = await supabase
        .from('conversations')
        .select('id, user_a, user_b')
        .eq('id', conversationId)
        .maybeSingle();

      if (error || !conv) {
        return;
      }

      const otherUserId = conv.user_a === user?.id ? conv.user_b : conv.user_a;

      const { data: profile } = await supabase
        .from('discoverable_profiles')
        .select(
          'id, name, age, sun_sign, moon_sign, rising_sign, bio, image_url, images, gender, interests, is_verified, has_voice_intro, voice_intro_url, last_active, created_at, current_city'
        )
        .eq('id', otherUserId)
        .maybeSingle();

      setConversationInfo({
        id: conv.id,
        user_a: conv.user_a,
        user_b: conv.user_b,
        other_user: profile || {
          id: otherUserId,
          name: t('unknown'),
          image_url: DEFAULT_PROFILE_IMAGE,
          sun_sign: '?',
        },
      });
    } catch (err) {
      console.error('Error loading conversation info:', err);
    }
  };

  const loadMessages = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading messages:', error);
      } else {
        setMessages(data || []);
        // Mark incoming messages as read after loading
        markMessagesAsRead();
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }

    setLoading(false);
  };

  const subscribeToMessages = () => {
    const subscription = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Q-L2: drop events that arrive after unmount.
          if (!isMountedRef.current) return;
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // P2-4: reconcile optimistic pending messages with the real row.
            // When our own echo comes back we drop ONE optimistic placeholder
            // (the oldest sending bubble with matching content) so the list
            // doesn't double up if the user sent the same text twice.
            if (newMsg.sender_id === user?.id) {
              let removed = false;
              const withoutOptimistic = prev.filter((m) => {
                if (
                  !removed &&
                  m.pendingStatus === 'sending' &&
                  m.sender_id === user.id &&
                  m.content === newMsg.content
                ) {
                  removed = true;
                  return false;
                }
                return true;
              });
              return [...withoutOptimistic, newMsg];
            }
            return [...prev, newMsg];
          });
          // Mark as read if the message is from the other user
          if (newMsg.sender_id !== user?.id) {
            markMessagesAsRead();
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  // P2-4: core insert helper — returns true on success.
  const insertMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!user || !conversationId) return false;
      try {
        await withRetry(async () => {
          const { error } = await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content,
          });
          if (error) throw error;
        });
        return true;
      } catch (err) {
        console.error('Error sending message:', err);
        return false;
      }
    },
    [user, conversationId]
  );

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !conversationId) return;
    if (!throttleAction('sendMessage', 1000)) return;

    const messageContent = newMessage.trim();

    // P2-4: keep an optimistic "sending" bubble in the list so users see
    // immediate feedback, even offline. We clear the input right away so
    // they can type the next message, but if the insert ultimately fails
    // the bubble flips to "failed" and offers a retry.
    const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Message = {
      id: clientId,
      clientId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: messageContent,
      created_at: new Date().toISOString(),
      is_read: false,
      pendingStatus: 'sending',
    };

    setSending(true);
    setNewMessage('');
    setHasPrefill(false);
    setMessages((prev) => [...prev, optimistic]);

    const ok = await insertMessage(messageContent);
    if (!isMountedRef.current) return;

    if (!ok) {
      // Flip the optimistic message to 'failed'. Keep it in the list so the
      // user can retry without retyping, but keep the input empty so the
      // next message isn't blocked.
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, pendingStatus: 'failed' } : m
        )
      );
    }
    // On success, the realtime subscription swaps the optimistic row for
    // the server row (see subscribeToMessages reconciliation).

    setSending(false);
  };

  // P2-4: retry a single failed message by clientId.
  const retryMessage = useCallback(
    async (failedMessage: Message) => {
      if (!failedMessage.clientId) return;
      const clientId = failedMessage.clientId;

      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, pendingStatus: 'sending' } : m
        )
      );

      const ok = await insertMessage(failedMessage.content);
      if (!isMountedRef.current) return;

      if (!ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === clientId ? { ...m, pendingStatus: 'failed' } : m
          )
        );
      }
    },
    [insertMessage]
  );

  const formatTime = formatMessageTime;

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;
    const isPending = item.pendingStatus === 'sending';
    const isFailed = item.pendingStatus === 'failed';

    const bubbleTestID = isPending
      ? 'chat-message-pending'
      : isFailed
      ? 'chat-message-failed'
      : isMe
      ? 'chat-message-sent'
      : 'chat-message-received';

    return (
      <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
        <View
          testID={bubbleTestID}
          style={[
            styles.messageBubble,
            isMe ? styles.messageBubbleMe : styles.messageBubbleThem,
            isPending && styles.messageBubblePending,
            isFailed && styles.messageBubbleFailed,
          ]}
        >
          <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.content}</Text>
          <View style={styles.messageMetaRow}>
            <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>
              {isPending
                ? t('sending') || 'Sending...'
                : isFailed
                ? t('messageFailed') || 'Not delivered'
                : formatTime(item.created_at)}
            </Text>
            {isPending && <ActivityIndicator size="small" color="#fff" style={styles.messageSpinner} />}
          </View>
          {isFailed && (
            <TouchableOpacity
              style={styles.resendButton}
              onPress={() => retryMessage(item)}
              accessibilityRole="button"
              accessibilityLabel={t('resend') || 'Resend'}
            >
              <Text style={styles.resendText}>{t('resend') || 'Resend'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0B0B14', '#151A2B', '#1E2540']} style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#C98692" />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0B0B14', '#151A2B', '#1E2540']} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>

          <Image
            source={{ uri: resolveProfileImage(conversationInfo?.other_user) }}
            style={styles.headerImage}
          />

          <TouchableOpacity
            style={styles.headerInfo}
            onPress={() => {
              if (conversationInfo?.other_user?.id) {
                // Internal route name is kept for back-compat; the destination
                // is the profile detail screen.
                router.push(`/match/${conversationInfo.other_user.id}`);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.headerName} numberOfLines={1}>
              {conversationInfo?.other_user?.name || t('chat')}
              {conversationInfo?.other_user?.age ? (
                <Text style={styles.headerAge}>{', ' + conversationInfo.other_user.age}</Text>
              ) : null}
            </Text>
            <View style={styles.headerMeta}>
              {conversationInfo?.other_user?.sun_sign && conversationInfo.other_user.sun_sign !== '?' ? (
                <Text style={styles.headerSign} numberOfLines={1}>
                  {[
                    conversationInfo.other_user.sun_sign,
                    conversationInfo.other_user.moon_sign,
                    // The conversation query carries no birth_time and no
                    // birth_chart, so this ascendant can never be proven real —
                    // and may be the 'Aries' the old fallback invented. Dropped
                    // rather than asserted about the person being messaged.
                    isRisingTrustworthy({
                      storedRisingSign: conversationInfo.other_user.rising_sign,
                    })
                      ? conversationInfo.other_user.rising_sign
                      : null,
                  ]
                    .filter((s) => s && s.length > 0)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>

          {user && conversationInfo?.other_user && (
            <BlockReportMenu
              userId={user.id}
              targetUserId={conversationInfo.other_user.id}
              targetUserName={conversationInfo.other_user.name}
              onBlock={() => router.replace('/(tabs)/chat')}
            />
          )}
        </View>

        {conversationInfo?.other_user?.id ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerActionChip}
              onPress={() => router.push(`/match/${conversationInfo.other_user.id}`)}
              accessibilityRole="button"
            >
              <Text style={styles.headerActionText}>{t('chatViewProfile') || 'View profile'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionChip}
              onPress={() =>
                router.push(`/premium-screens/synastry?profileId=${conversationInfo.other_user.id}` as any)
              }
              accessibilityRole="button"
            >
              <Text style={styles.headerActionText}>{t('chatCompareCharts') || 'Compare charts'}</Text>
            </TouchableOpacity>
            {/* Conversation Guide, at the moment of need. Free accounts get
                "Start a conversation" for all 12 signs with no gate and no
                quota, so this chip is shown to everyone — the Premium tab
                paywalls free users out of the hub, and this is where the need
                actually occurs. `resolveCoachSign` returns null rather than
                guessing when the other profile has no usable Sun sign; the
                screen then opens on its own picker. */}
            <TouchableOpacity
              style={styles.headerActionChip}
              onPress={() => {
                const targetSign = resolveCoachSign(conversationInfo.other_user.sun_sign);
                router.push(
                  (targetSign
                    ? `/premium-screens/conversation-guide?sign=${targetSign}`
                    : '/premium-screens/conversation-guide') as any
                );
              }}
              accessibilityRole="button"
              testID="chat-conversation-guide-chip"
            >
              <Text style={styles.headerActionText}>
                {t('conversationGuideChatChip') || 'Ways to say it'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>{t('chatThreadEmptyTitle') || 'Start the conversation'}</Text>
            <Text style={styles.emptyChatSubtext}>
              {t('chatThreadEmptySubtitle', { name: conversationInfo?.other_user?.name || '' }) ||
                t('sayHelloTo', { name: conversationInfo?.other_user?.name || '' })}
            </Text>

            {/* Icebreaker suggestions */}
            <View style={styles.icebreakersContainer}>
              <Text style={styles.icebreakersTitle}>{t('chatIcebreaker')}</Text>
              {[
                t('icebreaker1') || 'What got you into astrology?',
                t('icebreaker2', { sign: conversationInfo?.other_user?.sun_sign || '' }) || `Do you feel like a typical ${conversationInfo?.other_user?.sun_sign || ''}?`,
                t('icebreaker3', { sign: conversationInfo?.other_user?.sun_sign || '' }) || `What's the most ${conversationInfo?.other_user?.sun_sign || ''} thing about you?`,
              ].map((icebreaker, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.icebreakerPill}
                  onPress={() => {
                    setNewMessage(icebreaker);
                    setHasPrefill(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.icebreakerText}>{icebreaker}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            removeClippedSubviews={true}
            maxToRenderPerBatch={15}
            windowSize={10}
          />
        )}

        {/* Prefill helper bar — visible when a prompt/icebreaker is loaded */}
        {hasPrefill && newMessage.length > 0 ? (
          <View style={styles.prefillBar} testID="chat-prefill-helper">
            <View style={styles.prefillChip}>
              <Text style={styles.prefillChipText}>
                {t('chatIcebreakerChip') || 'Icebreaker'}
              </Text>
            </View>
            <Text style={styles.prefillHelperText} numberOfLines={2}>
              {t('chatPrefillHelper') || 'Edit the prompt before sending.'}
            </Text>
          </View>
        ) : null}

        {/* Input */}
        <View style={[styles.inputContainer, { paddingBottom: 12 + insets.bottom }]}>
          <TextInput
            style={styles.input}
            placeholder={t('chatComposerPlaceholder') || t('typeMessage') || 'Write something real…'}
            placeholderTextColor="#666"
            value={newMessage}
            onChangeText={(text) => {
              setNewMessage(text);
              if (text.length === 0) setHasPrefill(false);
            }}
            multiline
            maxLength={500}
            testID="chat-input"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
            testID="chat-send-button"
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>→</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingLeft: 56,
  },
  headerActionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  headerActionText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  headerAge: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backText: {
    fontSize: 24,
    color: '#fff',
  },
  headerImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  headerSign: {
    fontSize: 13,
    color: '#888',
  },
  headerCompatBadge: {
    backgroundColor: 'rgba(201, 134, 146, 0.16)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  headerCompatText: {
    color: '#C98692',
    fontSize: 10,
    fontWeight: '600',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageRow: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageBubbleThem: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 4,
  },
  messageBubbleMe: {
    backgroundColor: '#B76E79',
    borderBottomRightRadius: 4,
  },
  messageBubblePending: {
    opacity: 0.65,
  },
  messageBubbleFailed: {
    backgroundColor: '#6b2a37',
    borderColor: '#C98692',
    borderWidth: 1,
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
  messageSpinner: {
    marginLeft: 4,
  },
  resendButton: {
    marginTop: 6,
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  resendText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  messageText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  messageTextMe: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyChatEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyChatText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyChatSubtext: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  icebreakersContainer: {
    width: '100%',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  icebreakersTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  icebreakerPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  icebreakerText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyChatHint: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
    marginTop: 20,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
  },
  prefillBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(91, 84, 168, 0.06)',
  },
  prefillChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(91, 84, 168, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(91, 84, 168, 0.35)',
  },
  prefillChipText: {
    color: '#d8d2ff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  prefillHelperText: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#B76E79',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#666',
  },
  sendButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
});
