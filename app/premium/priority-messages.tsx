import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PremiumGate from '../../components/PremiumGate';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

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
  const [stats, setStats] = useState<MessageStats>({
    prioritySent: 8,
    responseRate: 85,
    avgResponseTime: '2h',
  });
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    loadPriorityMessages();
  }, [user]);

  const loadPriorityMessages = async () => {
    // In real app, load actual priority messages from Supabase
    // Simulated data for now
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
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('justNow') || 'Just now';
    if (diffMins < 60) return t('minutesAgo', { count: diffMins }) || `${diffMins}m ago`;
    if (diffHours < 24) return t('hoursAgo', { count: diffHours }) || `${diffHours}h ago`;
    return t('daysAgo', { count: diffDays }) || `${diffDays}d ago`;
  };

  const benefits = [
    {
      emoji: '📬',
      title: t('topOfInbox') || 'Top of Inbox',
      description: t('topOfInboxDesc') || 'Your message appears first in their chat list',
    },
    {
      emoji: '💜',
      title: t('specialHighlight') || 'Special Highlight',
      description: t('specialHighlightDesc') || 'Priority messages have a distinctive purple glow',
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
    t('starter2') || "Your Moon in Scorpio caught my eye. I bet you have amazing intuition!",
    t('starter3') || "Our Venus signs are a perfect match. Want to explore what that means?",
    t('starter4') || "I love that we share similar cosmic energy. What drew you to astrology?",
  ];

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('priorityMessages') || 'Priority Messages'}</Text>
          <Text style={styles.subtitle}>
            {t('priorityMessagesSubtitle') || 'Get noticed in crowded inboxes'}
          </Text>
        </View>

        {/* Stats Card */}
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

        {/* Demo Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('howItLooks') || 'How It Looks'}</Text>
          <View style={styles.demoContainer}>
            {/* Regular message */}
            <View style={styles.demoMessage}>
              <View style={styles.demoAvatar}>
                <Text style={styles.demoAvatarText}>J</Text>
              </View>
              <View style={styles.demoContent}>
                <Text style={styles.demoName}>John</Text>
                <Text style={styles.demoText}>Hey, how are you?</Text>
              </View>
              <Text style={styles.demoTime}>2h</Text>
            </View>

            {/* Priority message */}
            <View style={[styles.demoMessage, styles.priorityMessage]}>
              <View style={styles.priorityGlow} />
              <View style={[styles.demoAvatar, styles.priorityAvatar]}>
                <Text style={styles.demoAvatarText}>Y</Text>
              </View>
              <View style={styles.demoContent}>
                <View style={styles.priorityBadgeSmall}>
                  <Text style={styles.priorityBadgeIcon}>⭐</Text>
                  <Text style={styles.priorityBadgeText}>{t('priority') || 'Priority'}</Text>
                </View>
                <Text style={[styles.demoName, styles.priorityName]}>{t('you') || 'You'}</Text>
                <Text style={styles.demoText}>{t('yourMessage') || 'Your message here...'}</Text>
              </View>
              <Text style={styles.demoTime}>{t('now') || 'Now'}</Text>
            </View>

            {/* Regular message */}
            <View style={styles.demoMessage}>
              <View style={styles.demoAvatar}>
                <Text style={styles.demoAvatarText}>M</Text>
              </View>
              <View style={styles.demoContent}>
                <Text style={styles.demoName}>Mike</Text>
                <Text style={styles.demoText}>Nice to meet you!</Text>
              </View>
              <Text style={styles.demoTime}>5h</Text>
            </View>
          </View>
        </View>

        {/* Benefits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('benefits') || 'Benefits'}</Text>
          {benefits.map((benefit, index) => (
            <View key={index} style={styles.benefitCard}>
              <Text style={styles.benefitEmoji}>{benefit.emoji}</Text>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDesc}>{benefit.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Conversation Starters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('conversationStarters') || 'Cosmic Conversation Starters'}</Text>
          <Text style={styles.startersSubtitle}>
            {t('startersSubtitle') || 'Use these astrology-based openers for better results'}
          </Text>
          {conversationStarters.map((starter, index) => (
            <TouchableOpacity key={index} style={styles.starterCard}>
              <Text style={styles.starterQuote}>"</Text>
              <Text style={styles.starterText}>{starter}</Text>
              <View style={styles.copyButton}>
                <Text style={styles.copyText}>{t('copy') || 'Copy'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Priority Messages */}
        {messages.length > 0 && (
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
        )}

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push('/(tabs)/matches')}
        >
          <LinearGradient
            colors={['#9b59b6', '#8e44ad']}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaIcon}>💬</Text>
            <Text style={styles.ctaText}>
              {t('sendPriorityMessage') || 'Send a Priority Message'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* Premium Badge */}
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
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: '#fff',
    fontSize: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  statsCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(155, 89, 182, 0.15)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(155, 89, 182, 0.3)',
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
    color: '#9b59b6',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  demoContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
  },
  demoMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  priorityMessage: {
    backgroundColor: 'rgba(155, 89, 182, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(155, 89, 182, 0.4)',
    position: 'relative',
    overflow: 'hidden',
  },
  priorityGlow: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#9b59b6',
  },
  demoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  priorityAvatar: {
    backgroundColor: '#9b59b6',
  },
  demoAvatarText: {
    color: '#fff',
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
    color: '#9b59b6',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  demoName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  priorityName: {
    color: '#9b59b6',
  },
  demoText: {
    fontSize: 13,
    color: '#888',
  },
  demoTime: {
    fontSize: 12,
    color: '#666',
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
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
    color: '#fff',
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 14,
    color: '#888',
  },
  startersSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    marginTop: -8,
  },
  starterCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  starterQuote: {
    fontSize: 24,
    color: '#9b59b6',
    marginRight: 8,
    marginTop: -8,
    fontWeight: 'bold',
  },
  starterText: {
    flex: 1,
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  copyButton: {
    backgroundColor: 'rgba(155, 89, 182, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  copyText: {
    fontSize: 12,
    color: '#9b59b6',
    fontWeight: '600',
  },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
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
    color: '#fff',
    marginRight: 8,
  },
  compatBadge: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  compatText: {
    fontSize: 11,
    color: '#e94560',
    fontWeight: '600',
  },
  messagePreview: {
    fontSize: 14,
    color: '#888',
  },
  messageTime: {
    fontSize: 12,
    color: '#666',
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
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
    color: '#e94560',
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
