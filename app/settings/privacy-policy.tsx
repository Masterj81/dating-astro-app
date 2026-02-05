import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';

export default function PrivacyPolicyScreen() {
  const { t } = useLanguage();

  const sections = [
    {
      title: t('dataCollection') || 'Information We Collect',
      content:
        'When you use AstroDating, we collect the following information:\n\n' +
        '\u2022 Account Information: Your name, email address, date of birth, and password.\n\n' +
        '\u2022 Birth Data: Your birth date, birth time, and birth city, used to calculate your natal chart (Sun, Moon, and Rising signs).\n\n' +
        '\u2022 Profile Information: Photos, bio, occupation, and other details you choose to share on your profile.\n\n' +
        '\u2022 Location Data: Your approximate location to show you nearby profiles and calculate distance.\n\n' +
        '\u2022 Usage Data: How you interact with the app, including swipes, matches, messages, and feature usage.\n\n' +
        '\u2022 Device Information: Device type, operating system, app version, and unique device identifiers.',
    },
    {
      title: t('dataUsage') || 'How We Use Your Information',
      content:
        'We use the information we collect to:\n\n' +
        '\u2022 Calculate your astrological natal chart and compatibility scores with other users.\n\n' +
        '\u2022 Show you compatible profiles based on your preferences and astrological compatibility.\n\n' +
        '\u2022 Enable messaging and matching features between users.\n\n' +
        '\u2022 Generate personalized horoscopes and astrological insights.\n\n' +
        '\u2022 Send you notifications about matches, messages, and app updates.\n\n' +
        '\u2022 Improve our matching algorithms and app experience.\n\n' +
        '\u2022 Ensure safety and prevent fraud or abuse on the platform.',
    },
    {
      title: t('dataSharing') || 'How We Share Your Information',
      content:
        'We do not sell your personal data. We may share your information in the following circumstances:\n\n' +
        '\u2022 With Other Users: Your profile information, photos, and astrological data are visible to other users as part of the matching experience.\n\n' +
        '\u2022 Service Providers: We work with third-party providers for hosting, analytics, payment processing, and push notifications.\n\n' +
        '\u2022 Legal Requirements: We may disclose information if required by law, court order, or government request.\n\n' +
        '\u2022 Safety: We may share information to protect the safety of our users or the public.',
    },
    {
      title: t('dataStorage') || 'Data Storage & Security',
      content:
        'Your data is stored securely using industry-standard encryption and security practices.\n\n' +
        '\u2022 Data is stored on secure servers with encryption at rest and in transit.\n\n' +
        '\u2022 We use Supabase for database services, which provides enterprise-grade security.\n\n' +
        '\u2022 Your password is hashed and never stored in plain text.\n\n' +
        '\u2022 We retain your data for as long as your account is active. Upon account deletion, your data is permanently removed within 30 days.\n\n' +
        '\u2022 Photos are stored securely and removed upon account deletion.',
    },
    {
      title: t('userRights') || 'Your Rights',
      content:
        'You have the following rights regarding your personal data:\n\n' +
        '\u2022 Access: You can request a copy of the personal data we hold about you.\n\n' +
        '\u2022 Correction: You can update or correct your information through the app at any time.\n\n' +
        '\u2022 Deletion: You can delete your account and all associated data from the Settings screen.\n\n' +
        '\u2022 Portability: You can request your data in a portable format.\n\n' +
        '\u2022 Opt-Out: You can opt out of promotional communications and push notifications at any time.\n\n' +
        '\u2022 Withdraw Consent: You can withdraw consent for data processing where consent is the legal basis.',
    },
    {
      title: t('childrenPrivacy') || "Children's Privacy",
      content:
        'AstroDating is intended for users who are 18 years of age or older. We do not knowingly collect personal information from anyone under the age of 18.\n\n' +
        'If we learn that we have collected personal data from a user under 18, we will take steps to delete that information as quickly as possible.\n\n' +
        'If you are a parent or guardian and believe your child has provided us with personal information, please contact us so we can take appropriate action.',
    },
    {
      title: t('contactInfo') || 'Contact Us',
      content:
        'If you have any questions or concerns about this Privacy Policy or our data practices, please contact us:\n\n' +
        '\u2022 Email: privacy@astrodatingapp.com\n\n' +
        '\u2022 Website: https://astrodatingapp.com/contact\n\n' +
        'We will respond to your inquiry within 30 days.\n\n' +
        'This policy may be updated from time to time. We will notify you of any material changes through the app or by email.',
    },
  ];

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('privacyPolicyTitle') || 'Privacy Policy'}</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Effective Date */}
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>
            {t('effectiveDate') || 'Effective Date'}: January 1, 2025
          </Text>
          <Text style={styles.dateText}>
            {t('lastUpdated') || 'Last Updated'}: January 1, 2025
          </Text>
        </View>

        {/* Intro */}
        <View style={styles.introContainer}>
          <Text style={styles.introText}>
            AstroDating ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, share, and protect your personal information when you use our mobile application.
          </Text>
        </View>

        {/* Sections */}
        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {index + 1}. {section.title}
            </Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: {
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
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  dateContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  dateText: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  introContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  introText: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#e94560',
    marginBottom: 10,
  },
  sectionContent: {
    fontSize: 14,
    color: '#bbb',
    lineHeight: 22,
  },
});
