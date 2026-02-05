import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';

export default function TermsOfServiceScreen() {
  const { t } = useLanguage();

  const sections = [
    {
      title: t('eligibility') || 'Eligibility',
      content:
        'You must be at least 18 years old to use AstroDating. By creating an account, you confirm that:\n\n' +
        '\u2022 You are at least 18 years of age.\n\n' +
        '\u2022 You are legally able to enter into a binding agreement.\n\n' +
        '\u2022 You are not prohibited from using the service under any applicable law.\n\n' +
        '\u2022 You have not been previously banned from the platform.\n\n' +
        'We reserve the right to request proof of age at any time and to terminate accounts that do not meet this requirement.',
    },
    {
      title: t('account') || 'Your Account',
      content:
        'When you create an AstroDating account, you agree to:\n\n' +
        '\u2022 Provide accurate, current, and complete information during registration.\n\n' +
        '\u2022 Maintain the security of your password and account.\n\n' +
        '\u2022 Notify us immediately of any unauthorized access to your account.\n\n' +
        '\u2022 Not create more than one account per person.\n\n' +
        '\u2022 Not transfer your account to another person.\n\n' +
        'You are responsible for all activity that occurs under your account.',
    },
    {
      title: t('userConduct') || 'User Conduct',
      content:
        'You agree not to:\n\n' +
        '\u2022 Use the app for any illegal or unauthorized purpose.\n\n' +
        '\u2022 Harass, abuse, threaten, or intimidate other users.\n\n' +
        '\u2022 Post content that is hateful, discriminatory, or violent.\n\n' +
        '\u2022 Impersonate any person or entity.\n\n' +
        '\u2022 Send spam, unsolicited messages, or promotional content.\n\n' +
        '\u2022 Use the app to solicit money from other users.\n\n' +
        '\u2022 Upload photos that do not belong to you or that contain nudity or explicit content.\n\n' +
        '\u2022 Use automated systems (bots, scripts) to access the service.\n\n' +
        '\u2022 Attempt to extract data or reverse engineer the app.\n\n' +
        'Violations may result in immediate account termination.',
    },
    {
      title: t('contentOwnership') || 'Content Ownership',
      content:
        '\u2022 You retain ownership of the content you post on AstroDating, including photos, bio text, and messages.\n\n' +
        '\u2022 By posting content, you grant AstroDating a non-exclusive, worldwide, royalty-free license to use, display, and distribute your content within the app for the purpose of providing the service.\n\n' +
        '\u2022 This license ends when you delete your content or account.\n\n' +
        '\u2022 AstroDating owns all intellectual property related to the app, including the matching algorithms, astrological calculations, design, and branding.\n\n' +
        '\u2022 You may not copy, modify, or distribute any part of the app without permission.',
    },
    {
      title: t('subscriptions') || 'Subscriptions & Payments',
      content:
        '\u2022 AstroDating offers free and premium subscription tiers.\n\n' +
        '\u2022 Premium subscriptions are billed through the App Store or Google Play.\n\n' +
        '\u2022 Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.\n\n' +
        '\u2022 You can manage or cancel your subscription through your device settings.\n\n' +
        '\u2022 Refunds are handled according to the policies of the App Store or Google Play.\n\n' +
        '\u2022 AstroDating reserves the right to change subscription prices with advance notice. Price changes will not affect your current billing period.',
    },
    {
      title: t('termination') || 'Termination',
      content:
        '\u2022 You may delete your account at any time from the Settings screen.\n\n' +
        '\u2022 AstroDating may suspend or terminate your account if you violate these Terms, engage in harmful behavior, or for any other reason at our discretion.\n\n' +
        '\u2022 Upon termination, your right to use the app ceases immediately.\n\n' +
        '\u2022 We may retain certain information as required by law or for legitimate business purposes.\n\n' +
        '\u2022 Termination does not entitle you to a refund for any unused portion of a paid subscription.',
    },
    {
      title: t('disclaimers') || 'Disclaimers',
      content:
        '\u2022 AstroDating is provided "as is" and "as available" without warranties of any kind.\n\n' +
        '\u2022 We do not guarantee that the app will be uninterrupted, error-free, or secure.\n\n' +
        '\u2022 Astrological compatibility scores and horoscopes are for entertainment purposes only and should not be relied upon for making life decisions.\n\n' +
        '\u2022 We are not responsible for the behavior of other users. Always exercise caution when meeting someone in person.\n\n' +
        '\u2022 We do not perform background checks on users.\n\n' +
        '\u2022 We are not responsible for any content posted by users.',
    },
    {
      title: t('limitationOfLiability') || 'Limitation of Liability',
      content:
        'To the maximum extent permitted by law:\n\n' +
        '\u2022 AstroDating shall not be liable for any indirect, incidental, special, consequential, or punitive damages.\n\n' +
        '\u2022 Our total liability shall not exceed the amount you paid to AstroDating in the 12 months preceding the claim.\n\n' +
        '\u2022 This includes damages for loss of profits, data, or other intangible losses.\n\n' +
        '\u2022 Some jurisdictions do not allow limitations on liability, so these limits may not apply to you.',
    },
    {
      title: t('contactInfo') || 'Contact Us',
      content:
        'If you have any questions about these Terms of Service, please contact us:\n\n' +
        '\u2022 Email: legal@astrodatingapp.com\n\n' +
        '\u2022 Website: https://astrodatingapp.com/contact\n\n' +
        'We may update these Terms from time to time. Continued use of the app after changes constitutes acceptance of the new Terms. We will notify you of material changes through the app.',
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
          <Text style={styles.title}>{t('termsOfServiceTitle') || 'Terms of Service'}</Text>
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
            Welcome to AstroDating. By accessing or using our application, you agree to be bound by these Terms of Service. If you do not agree to these Terms, please do not use the app.
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
