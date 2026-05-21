import { LinearGradient } from 'expo-linear-gradient';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function DataDeletionScreen() {
  return (
    <LinearGradient
      colors={['#0f0f1a', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>Data Deletion Instructions</Text>
          <Text style={styles.lastUpdated}>JUNO</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How to Delete Your Data</Text>
            <Text style={styles.sectionText}>
              You can delete your JUNO account and all associated data at any time.
              Follow these steps:
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Option 1: Delete from the App</Text>
            <Text style={styles.sectionText}>
              1. Open the JUNO app{'\n'}
              2. Go to your Profile tab{'\n'}
              3. Tap the Settings icon (gear){'\n'}
              4. Scroll down and tap {'"'}Delete Account{'"'}{'\n'}
              5. Confirm your decision (you may be asked to sign in again){'\n\n'}
              Your profile is hidden immediately. Your account and all
              associated data are then permanently deleted 7 days later.
              During the grace period you can cancel the deletion via the
              link in the confirmation email we send you, or by signing back
              in and tapping {'"'}Cancel account deletion{'"'} in Settings.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Option 2: Email Request</Text>
            <Text style={styles.sectionText}>
              Send an email to:{'\n\n'}
              privacy@astrodatingapp.com{'\n\n'}
              Include:{'\n'}
              - Subject: {'"'}Data Deletion Request{'"'}{'\n'}
              - Your registered email address{'\n'}
              - Confirmation that you want all data deleted{'\n\n'}
              We will process your request within 30 days.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Grace Period & Cancellation</Text>
            <Text style={styles.sectionText}>
              For safety, deletions are not immediate. After you confirm, your
              profile is hidden from other users, but the account itself stays
              recoverable for 7 days. You can cancel the deletion any time
              during that window:{'\n\n'}
              - Use the {'"'}Cancel deletion{'"'} link in the email we sent you,{'\n'}
              - Or sign back in and tap {'"'}Cancel account deletion{'"'} in Settings.{'\n\n'}
              After the 7th day, the deletion becomes permanent and cannot be
              reversed.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What Data is Deleted</Text>
            <Text style={styles.sectionText}>
              Once the grace period expires, we permanently remove:{'\n\n'}
              - Your profile information{'\n'}
              - Photos and media{'\n'}
              - Birth date and astrological data{'\n'}
              - Messages and chat history{'\n'}
              - Connections and discovery activity{'\n'}
              - Payment records (except as required by law){'\n'}
              - All other personal data
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Facebook Login Users</Text>
            <Text style={styles.sectionText}>
              If you signed up using Facebook, you can also remove JUNO{"'"}s
              access to your Facebook data:{'\n\n'}
              1. Go to Facebook Settings{'\n'}
              2. Navigate to Apps and Websites{'\n'}
              3. Find JUNO and click Remove{'\n\n'}
              Note: This removes Facebook{"'"}s connection but you should also delete
              your JUNO account using the steps above to remove all data
              from our servers.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Us</Text>
            <Text style={styles.sectionText}>
              For questions about data deletion:{'\n\n'}
              Email: privacy@astrodatingapp.com{'\n'}
              Website: https://www.astrodatingapp.com
            </Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  } as any,
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 48,
  },
  content: {
    paddingHorizontal: 24,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  lastUpdated: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e94560',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 24,
  },
});
