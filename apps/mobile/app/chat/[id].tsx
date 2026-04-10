import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import BlockReportMenu from '../../components/BlockReportMenu';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { formatMessageTime } from '../../utils/dateFormatting';
import { DEFAULT_PROFILE_IMAGE, resolveProfileImage } from '../../utils/profileImages';
import { throttleAction } from '../../utils/rateLimit';
import { useAuth } from '../../contexts/AuthContext';

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read: boolean;
};

type MatchInfo = {
  id: string;
  user1_id: string;
  user2_id: string;
  compatibility_score?: number;
  other_user: {
    id: string;
    name: string;
    image_url?: string | null;
    photos?: Array<string | null>;
    images?: Array<string | null>;
    sun_sign: string;
  };
};

export default function ChatScreen() {
  const { id: matchId } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (matchId && user) {
      loadMatchInfo();
      loadMessages();
      const unsubscribe = subscribeToMessages();
      return () => { unsubscribe(); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [matchId, user]);

  const loadMatchInfo = async () => {
    try {
      const { data: match, error } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();

      if (error || !match) {
        return;
      }

      // Get the other user's profile
      const otherUserId = match.user1_id === user?.id ? match.user2_id : match.user1_id;

      const { data: profile } = await supabase
        .from('discoverable_profiles')
        .select('*')
        .eq('id', otherUserId)
        .maybeSingle();

      setMatchInfo({
        ...match,
        other_user: profile || {
          id: otherUserId,
          name: t('unknown'),
          image_url: DEFAULT_PROFILE_IMAGE,
          sun_sign: '?',
        },
      });
    } catch (err) {
      console.error('Error loading match info:', err);
    }
  };

  const loadMessages = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading messages:', error);
      } else {
        setMessages(data || []);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }

    setLoading(false);
  };

  const subscribeToMessages = () => {
    const subscription = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !matchId) return;
    if (!throttleAction('sendMessage', 1000)) return;

    setSending(true);
    const messageContent = newMessage.trim();
    setNewMessage('');

    try {
      const { error } = await supabase.from('messages').insert({
        match_id: matchId,
        sender_id: user.id,
        content: messageContent,
      });

      if (error) {
        setNewMessage(messageContent);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setNewMessage(messageContent);
    }

    setSending(false);
  };

  const formatTime = formatMessageTime;

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;

    return (
      <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
        <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleThem]}>
          <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.content}</Text>
          <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>{formatTime(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <Image
          source={{ uri: resolveProfileImage(matchInfo?.other_user) }}
          style={styles.headerImage}
        />

        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => {
            if (matchInfo?.other_user?.id) {
              router.push(`/match/${matchInfo.other_user.id}`);
            }
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.headerName}>{matchInfo?.other_user?.name || t('chat')}</Text>
          <View style={styles.headerMeta}>
            <Text style={styles.headerSign}>☀️ {matchInfo?.other_user?.sun_sign || '?'}</Text>
            {matchInfo?.compatibility_score && (
              <View style={styles.headerCompatBadge}>
                <Text style={styles.headerCompatText}>
                  {t('chatCompatibility', { score: matchInfo.compatibility_score }) || `${matchInfo.compatibility_score}% compatible`}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {user && matchInfo?.other_user && (
          <BlockReportMenu
            userId={user.id}
            targetUserId={matchInfo.other_user.id}
            targetUserName={matchInfo.other_user.name}
            matchId={matchInfo.id}
            onBlock={() => router.replace('/(tabs)/matches')}
            onUnmatch={() => router.replace('/(tabs)/matches')}
          />
        )}
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatEmoji}>💫</Text>
            <Text style={styles.emptyChatText}>{t('startCosmicConversation')}</Text>
            <Text style={styles.emptyChatSubtext}>{t('sayHelloTo', { name: matchInfo?.other_user?.name || '' })}</Text>

            {/* Icebreaker suggestions */}
            <View style={styles.icebreakersContainer}>
              <Text style={styles.icebreakersTitle}>{t('chatIcebreaker')}</Text>
              {[
                t('icebreaker1') || 'What got you into astrology?',
                t('icebreaker2', { sign: matchInfo?.other_user?.sun_sign || '' }) || `Do you feel like a typical ${matchInfo?.other_user?.sun_sign || ''}?`,
                t('icebreaker3', { sign: matchInfo?.other_user?.sun_sign || '' }) || `What's the most ${matchInfo?.other_user?.sun_sign || ''} thing about you?`,
              ].map((icebreaker, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.icebreakerPill}
                  onPress={() => setNewMessage(icebreaker)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.icebreakerText}>{icebreaker}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.emptyChatHint}>{t('chatEmptyHint')}</Text>
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

        {/* Input */}
        <View style={[styles.inputContainer, { paddingBottom: 12 + insets.bottom }]}>
          <TextInput
            style={styles.input}
            placeholder={t('typeMessage')}
            placeholderTextColor="#666"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  headerCompatText: {
    color: '#e94560',
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
    backgroundColor: '#e94560',
    borderBottomRightRadius: 4,
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
    backgroundColor: '#e94560',
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
