import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatRelativeTime } from '../../utils/dateFormatting';

type PriorityMessage = {
  id: string;
  sender_name: string;
  sender_image: string;
  preview: string;
  sent_at: string;
  compatibility: number;
};

type MessageStats = {
  prioritySent: number;
  responseRate: number;
  avgResponseTime: string;
};

function PriorityMessagesScreenContent() {
  const [messages, setMessages] = useState<PriorityMessage[]>([]);
  const [stats] = useState<MessageStats>({
    prioritySent: 8,
    responseRate: 85,
    avgResponseTime: '2h',
  });
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setMessages([
      {
        id: '1',
        sender_name: 'Luna',
        sender_image: 'https://i.pravatar.cc/150?img=1',
        preview: 'Hey! I noticed we both have Moon in Pisces...',
        sent_at: new Date(Date.now() - 3600000).toISOString(),
        compatibility: 92,
      },
      {
        id: '2',
        sender_name: 'Stella',
        sender_image: 'https://i.pravatar.cc/150?img=2',
        preview: 'Your birth chart is so fascinating!',
        sent_at: new Date(Date.now() - 7200000).toISOString(),
        compatibility: 88,
      },
    ]);
  }, [user]);

  const formatTimeAgo = (dateString: string) => formatRelativeTime(dateString, t);

  const benefits = [
    {
      emoji: '📬',
      title: t('topOfInbox') || 'Top of Inbox',
      description: t('topOfInboxDesc') || 'Your message appears first in their chat list',
    },
    {
      emoji: '💎',
      title: t('specialHighlight') || 'Special Highlight',
      description: t('specialHighlightDesc') || 'Priority messages have a distinctive glow',
    },
    {
      emoji: '📈',
      title: t('higherResponse') || '85% Higher Response Rate',
      description: t('higherResponseDesc') || 'Premium members respond more to priority messages',
    },
    {
      emoji: '⏰',
      title: t('readReceipts') || 'Read Receipts',
      description: t('readReceiptsDesc') || 'Know when your message has been read',
    },
  ];

  const conversationStarters = [
    t('starter1') || "I noticed we're both fire signs! What's your take on sign compatibility?",
    t('starter2') || 'Your Moon in Scorpio caught my eye. I bet you have amazing intuition!',
    t('starter3') || 'Our Venus signs are a perfect match. Want to explore what that means?',
    t('starter4') || 'I love that we share similar cosmic energy. What drew you to astrology?',
  ];

  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.header, { paddingTop: 40 + topInset }]}>
        <TouchableOpacity style={[styles.backButton, { top: 30 + topInset }]} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('priorityMessages') || 'Priority Messages'}</Text>
        <Text style={styles.subtitle}>{t('priorityMessagesSubtitle') || 'Get noticed in crowded inboxes'}</Text>
      </View>


        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.prioritySent}</Text>
              <Text style={styles.statLabel}>{t('sent') || 'Sent'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.responseRate}%</Text>
              <Text style={styles.statLabel}>{t('responseRate') || 'Response Rate'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.avgResponseTime}</Text>
              <Text style={styles.statLabel}>{t('avgResponse') || 'Avg Response'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('howItLooks') || 'How It Looks'}</Text>
          <View style={styles.demoContainer}>
            {[
              { initial: 'J', name: 'John', text: 'Hey, how are you?', time: '2h', priority: false },
              { initial: 'Y', name: t('you') || 'You', text: t('yourMessage') || 'Your message here...', time: t('now') || 'Now', priority: true },
              { initial: 'M', name: 'Mike', text: 'Nice to meet you!', time: '5h', priority: false },
            ].map((row) => (
              <View key={`${row.initial}-${row.time}`} style={[styles.demoMessage, row.priority && styles.priorityMessage]}>
                {row.priority ? <View style={styles.priorityGlow} /> : null}
                <View style={[styles.demoAvatar, row.priority && styles.priorityAvatar]}>
                  <Text style={styles.demoAvatarText}>{row.initial}</Text>
                </View>
                <View style={styles.demoContent}>
                  {row.priority ? (
                    <View style={styles.priorityBadgeSmall}>
                      <Text style={styles.priorityBadgeIcon}>⭐</Text>
                      <Text style={styles.priorityBadgeText}>{t('priority') || 'Priority'}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.demoName, row.priority && styles.priorityName]}>{row.name}</Text>
                  <Text style={styles.demoText}>{row.text}</Text>
                </View>
                <Text style={styles.demoTime}>{row.time}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('benefits') || 'Benefits'}</Text>
          {benefits.map((benefit) => (
            <View key={benefit.title} style={styles.benefitCard}>
              <Text style={styles.benefitEmoji}>{benefit.emoji}</Text>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDesc}>{benefit.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('conversationStarters') || 'Cosmic Conversation Starters'}</Text>
          <Text style={styles.startersSubtitle}>
            {t('startersSubtitle') || 'Use these astrology-based openers for better results'}
          </Text>
          {conversationStarters.map((starter) => (
            <TouchableOpacity key={starter} style={styles.starterCard}>
              <Text style={styles.starterQuote}>"</Text>
              <Text style={styles.starterText}>{starter}</Text>
              <View style={styles.copyButton}>
                <Text style={styles.copyText}>{t('copy') || 'Copy'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {messages.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('recentPriority') || 'Recent Priority Messages'}</Text>
            {messages.map((msg) => (
              <TouchableOpacity
                key={msg.id}
                style={styles.messageCard}
                onPress={() => router.push(`/chat/${msg.id}` as any)}
              >
                <Image source={{ uri: msg.sender_image }} style={styles.messageAvatar} />
                <View style={styles.messageContent}>
                  <View style={styles.messageHeader}>
                    <Text style={styles.messageName}>{msg.sender_name}</Text>
                    <View style={styles.compatBadge}>
                      <Text style={styles.compatText}>{msg.compatibility}%</Text>
                    </View>
                  </View>
                  <Text style={styles.messagePreview} numberOfLines={1}>
                    {msg.preview}
                  </Text>
                </View>
                <Text style={styles.messageTime}>{formatTimeAgo(msg.sent_at)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/(tabs)/matches')}>
          <LinearGradient colors={[AppTheme.colors.cosmic, AppTheme.colors.ctaEnd]} style={styles.ctaGradient}>
            <Text style={styles.ctaIcon}>💬</Text>
            <Text style={styles.ctaText}>{t('sendPriorityMessage') || 'Send a Priority Message'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.premiumBadge}>
        <Text style={styles.premiumIcon}>⭐</Text>
        <Text style={styles.premiumText}>{t('premiumFeature') || 'Premium Feature'}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          height: '100%' as any,
          width: '100%' as any,
        }
      : {}),
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          height: 'calc(100vh - 120px)' as any,
          overflowY: 'auto' as any,
        }
      : {}),
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panelStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: AppTheme.colors.textSecondary,
  },
  statsCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(124, 108, 255, 0.14)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppTheme.colors.cosmic,
  },
  statLabel: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: AppTheme.colors.border,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 16,
  },
  demoContainer: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  demoMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  priorityMessage: {
    backgroundColor: 'rgba(124, 108, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
    position: 'relative',
    overflow: 'hidden',
  },
  priorityGlow: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: AppTheme.colors.cosmic,
  },
  demoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panelStrong,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  priorityAvatar: {
    backgroundColor: AppTheme.colors.cosmic,
  },
  demoAvatarText: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  demoContent: {
    flex: 1,
  },
  priorityBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  priorityBadgeIcon: {
    fontSize: 10,
  },
  priorityBadgeText: {
    fontSize: 10,
    color: AppTheme.colors.cosmic,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  demoName: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 2,
  },
  priorityName: {
    color: AppTheme.colors.cosmic,
  },
  demoText: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
  },
  demoTime: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  benefitEmoji: {
    fontSize: 28,
    marginRight: 16,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
  },
  startersSubtitle: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    marginBottom: 16,
    marginTop: -8,
  },
  starterCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  starterQuote: {
    fontSize: 24,
    color: AppTheme.colors.cosmic,
    marginRight: 8,
    marginTop: -8,
    fontWeight: 'bold',
  },
  starterText: {
    flex: 1,
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  copyButton: {
    backgroundColor: 'rgba(124, 108, 255, 0.16)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  copyText: {
    fontSize: 12,
    color: AppTheme.colors.cosmic,
    fontWeight: '600',
  },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  messageAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageName: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginRight: 8,
  },
  compatBadge: {
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  compatText: {
    fontSize: 11,
    color: AppTheme.colors.coral,
    fontWeight: '600',
  },
  messagePreview: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
  },
  messageTime: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
  },
  ctaButton: {
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  ctaIcon: {
    fontSize: 20,
  },
  ctaText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 18,
    fontWeight: '600',
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  premiumIcon: {
    fontSize: 14,
  },
  premiumText: {
    fontSize: 12,
    color: AppTheme.colors.coral,
    fontWeight: '600',
  },
});

export default function PriorityMessagesScreen() {
  return (
    <PremiumGate feature="priority-messages">
      <PriorityMessagesScreenContent />
    </PremiumGate>
  );
}
