import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PremiumGate from '../../components/PremiumGate';
import { useLanguage } from '../../contexts/LanguageContext';

type RetrogradeEvent = {
  planet: string;
  emoji: string;
  status: 'retrograde' | 'direct' | 'upcoming';
  startDate: string;
  endDate: string;
  daysRemaining?: number;
  effects: string[];
  doList: string[];
  dontList: string[];
};

type RetrogradeAlert = {
  id: string;
  label: string;
  emoji: string;
  enabled: boolean;
};

function RetrogradeAlertsScreenContent() {
  const { t } = useLanguage();

  const getMonthName = (monthIndex: number, short: boolean = true): string => {
    const months = short
      ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      : ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const formatDate = (month: number, day: number): string => {
    return `${getMonthName(month)} ${day}`;
  };

  const [alerts, setAlerts] = useState<RetrogradeAlert[]>([
    { id: 'mercury', label: t('mercuryRetrograde'), emoji: '☿️', enabled: true },
    { id: 'venus', label: t('venusRetrograde'), emoji: '♀️', enabled: true },
    { id: 'mars', label: t('marsRetrograde'), emoji: '♂️', enabled: true },
    { id: 'jupiter', label: t('jupiterRetrograde'), emoji: '♃', enabled: false },
    { id: 'saturn', label: t('saturnRetrograde'), emoji: '♄', enabled: false },
    { id: 'preRetrograde', label: t('preRetrogradeShadow'), emoji: '🌑', enabled: true },
    { id: 'postRetrograde', label: t('postRetrogradeShadow'), emoji: '🌕', enabled: true },
  ]);

  const toggleAlert = (id: string) => {
    setAlerts(alerts.map(alert =>
      alert.id === id ? { ...alert, enabled: !alert.enabled } : alert
    ));
  };

  const getRetrogrades = (): RetrogradeEvent[] => {
    return [
      {
        planet: t('mercury'),
        emoji: '☿️',
        status: 'upcoming',
        startDate: formatDate(3, 1),
        endDate: formatDate(3, 25),
        daysRemaining: 58,
        effects: [t('mercuryEffect1'), t('mercuryEffect2'), t('mercuryEffect3')],
        doList: [t('mercuryDo1'), t('mercuryDo2'), t('mercuryDo3')],
        dontList: [t('mercuryDont1'), t('mercuryDont2'), t('mercuryDont3')],
      },
      {
        planet: t('venus'),
        emoji: '♀️',
        status: 'direct',
        startDate: formatDate(6, 22),
        endDate: formatDate(8, 3),
        effects: [t('venusEffect1'), t('venusEffect2'), t('venusEffect3')],
        doList: [t('venusDo1'), t('venusDo2'), t('venusDo3')],
        dontList: [t('venusDont1'), t('venusDont2'), t('venusDont3')],
      },
      {
        planet: t('mars'),
        emoji: '♂️',
        status: 'direct',
        startDate: formatDate(11, 6),
        endDate: formatDate(1, 23),
        effects: [t('marsEffect1'), t('marsEffect2'), t('marsEffect3')],
        doList: [t('marsDo1'), t('marsDo2'), t('marsDo3')],
        dontList: [t('marsDont1'), t('marsDont2'), t('marsDont3')],
      },
      {
        planet: t('saturn'),
        emoji: '♄',
        status: 'direct',
        startDate: formatDate(5, 29),
        endDate: formatDate(10, 15),
        effects: [t('saturnEffect1'), t('saturnEffect2'), t('saturnEffect3')],
        doList: [t('saturnDo1'), t('saturnDo2'), t('saturnDo3')],
        dontList: [t('saturnDont1'), t('saturnDont2'), t('saturnDont3')],
      },
    ];
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'retrograde': return '#f87171';
      case 'upcoming': return '#fbbf24';
      default: return '#4ade80';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'retrograde': return t('currentlyRetrograde');
      case 'upcoming': return t('upcomingRetrograde');
      default: return t('currentlyDirect');
    }
  };

  const retrogrades = getRetrogrades();
  const [expandedPlanet, setExpandedPlanet] = useState<string | null>('mercury');

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('retrogradeAlerts')}</Text>
          <Text style={styles.subtitle}>{t('retrogradeSubtitle')}</Text>
        </View>

        {/* Current Status Overview */}
        <View style={styles.statusOverview}>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: '#f87171' }]} />
            <Text style={styles.statusCount}>0</Text>
            <Text style={styles.statusLabel}>{t('retrograde')}</Text>
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: '#fbbf24' }]} />
            <Text style={styles.statusCount}>1</Text>
            <Text style={styles.statusLabel}>{t('upcoming')}</Text>
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: '#4ade80' }]} />
            <Text style={styles.statusCount}>3</Text>
            <Text style={styles.statusLabel}>{t('direct')}</Text>
          </View>
        </View>

        {/* Retrogrades List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('retrogradeStatus')}</Text>

          {retrogrades.map((retro, index) => (
            <TouchableOpacity
              key={index}
              style={styles.retroCard}
              onPress={() => setExpandedPlanet(expandedPlanet === retro.planet ? null : retro.planet)}
              activeOpacity={0.8}
            >
              <View style={styles.retroHeader}>
                <Text style={styles.retroEmoji}>{retro.emoji}</Text>
                <View style={styles.retroInfo}>
                  <Text style={styles.retroPlanet}>{retro.planet}</Text>
                  <Text style={styles.retroDates}>{retro.startDate} - {retro.endDate}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(retro.status) + '30' }]}>
                  <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(retro.status) }]} />
                  <Text style={[styles.statusText, { color: getStatusColor(retro.status) }]}>
                    {getStatusLabel(retro.status)}
                  </Text>
                </View>
              </View>

              {retro.daysRemaining && (
                <View style={styles.countdownBanner}>
                  <Text style={styles.countdownText}>
                    ⏱️ {t('startsIn')} {retro.daysRemaining} {t('days')}
                  </Text>
                </View>
              )}

              {expandedPlanet === retro.planet && (
                <View style={styles.expandedContent}>
                  {/* Effects */}
                  <View style={styles.effectsSection}>
                    <Text style={styles.effectsTitle}>{t('effects')}</Text>
                    {retro.effects.map((effect, i) => (
                      <View key={i} style={styles.effectRow}>
                        <Text style={styles.effectBullet}>•</Text>
                        <Text style={styles.effectText}>{effect}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Do's */}
                  <View style={styles.doSection}>
                    <Text style={styles.doTitle}>✅ {t('whatToDo')}</Text>
                    {retro.doList.map((item, i) => (
                      <Text key={i} style={styles.doText}>• {item}</Text>
                    ))}
                  </View>

                  {/* Don'ts */}
                  <View style={styles.dontSection}>
                    <Text style={styles.dontTitle}>❌ {t('whatToAvoid')}</Text>
                    {retro.dontList.map((item, i) => (
                      <Text key={i} style={styles.dontText}>• {item}</Text>
                    ))}
                  </View>
                </View>
              )}

              <Text style={styles.expandHint}>
                {expandedPlanet === retro.planet ? '▲ ' + t('tapToCollapse') : '▼ ' + t('tapToExpand')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Alert Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('alertSettings')}</Text>

          <View style={styles.alertsCard}>
            {alerts.map((alert, index) => (
              <View key={alert.id} style={[styles.alertRow, index < alerts.length - 1 && styles.alertBorder]}>
                <Text style={styles.alertEmoji}>{alert.emoji}</Text>
                <Text style={styles.alertLabel}>{alert.label}</Text>
                <Switch
                  value={alert.enabled}
                  onValueChange={() => toggleAlert(alert.id)}
                  trackColor={{ false: '#333', true: 'rgba(147, 51, 234, 0.5)' }}
                  thumbColor={alert.enabled ? '#9333ea' : '#888'}
                />
              </View>
            ))}
          </View>

          <Text style={styles.alertHint}>{t('alertHint')}</Text>
        </View>

        {/* Survival Guide */}
        <View style={styles.survivalCard}>
          <Text style={styles.survivalTitle}>🛡️ {t('retrogradeSurvival')}</Text>
          <Text style={styles.survivalText}>{t('survivalTip1')}</Text>
          <Text style={styles.survivalText}>{t('survivalTip2')}</Text>
          <Text style={styles.survivalText}>{t('survivalTip3')}</Text>
        </View>

        {/* Premium Badge */}
        <View style={styles.premiumBadge}>
          <Text style={styles.premiumIcon}>✨</Text>
          <Text style={styles.premiumText}>{t('premiumPlusFeature')}</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  statusOverview: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  statusItem: {
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 6,
  },
  statusCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusLabel: {
    fontSize: 12,
    color: '#888',
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
  retroCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  retroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  retroEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  retroInfo: {
    flex: 1,
  },
  retroPlanet: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  retroDates: {
    fontSize: 13,
    color: '#888',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  countdownBanner: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  countdownText: {
    fontSize: 13,
    color: '#fbbf24',
    fontWeight: '500',
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  effectsSection: {
    marginBottom: 16,
  },
  effectsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  effectRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  effectBullet: {
    color: '#888',
    marginRight: 8,
  },
  effectText: {
    flex: 1,
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
  },
  doSection: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  doTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4ade80',
    marginBottom: 8,
  },
  doText: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 4,
    lineHeight: 18,
  },
  dontSection: {
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  dontTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f87171',
    marginBottom: 8,
  },
  dontText: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 4,
    lineHeight: 18,
  },
  expandHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  alertsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  alertBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  alertEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  alertLabel: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  alertHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  survivalCard: {
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  survivalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9333ea',
    marginBottom: 12,
  },
  survivalText: {
    fontSize: 13,
    color: '#ccc',
    lineHeight: 20,
    marginBottom: 8,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    marginHorizontal: 60,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  premiumIcon: {
    fontSize: 16,
  },
  premiumText: {
    fontSize: 12,
    color: '#9333ea',
    fontWeight: '600',
  },
});

export default function RetrogradeAlertsScreen() {
  return (
    <PremiumGate feature="retrograde-alerts">
      <RetrogradeAlertsScreenContent />
    </PremiumGate>
  );
}
