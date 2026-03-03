import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { blockUser, reportUser, unmatchUser, ReportReason } from '../services/blockingService';
import { errorNotification, successNotification } from '../services/haptics';

interface BlockReportMenuProps {
  userId: string;
  targetUserId: string;
  targetUserName: string;
  matchId?: string;
  onBlock?: () => void;
  onUnmatch?: () => void;
  onReport?: () => void;
  showUnmatch?: boolean;
}

export default function BlockReportMenu({
  userId,
  targetUserId,
  targetUserName,
  matchId,
  onBlock,
  onUnmatch,
  onReport,
  showUnmatch = true,
}: BlockReportMenuProps) {
  const { t } = useLanguage();
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);

  const reportReasons: { key: ReportReason; label: string }[] = [
    { key: 'inappropriate_photos', label: t('reportReasonPhotos') },
    { key: 'harassment', label: t('reportReasonHarassment') },
    { key: 'spam', label: t('reportReasonSpam') },
    { key: 'fake_profile', label: t('reportReasonFake') },
    { key: 'underage', label: t('reportReasonUnderage') },
    { key: 'other', label: t('reportReasonOther') },
  ];

  const handleBlock = () => {
    setMenuVisible(false);
    Alert.alert(
      t('blockUser'),
      t('blockConfirmMessage', { name: targetUserName }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('block'),
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const result = await blockUser(userId, targetUserId);
            setLoading(false);

            if (result.success) {
              await successNotification();
              Alert.alert(t('blocked'), t('blockSuccessMessage', { name: targetUserName }));
              onBlock?.();
            } else {
              await errorNotification();
              Alert.alert(t('error'), result.error || t('blockError'));
            }
          },
        },
      ]
    );
  };

  const handleUnmatch = () => {
    if (!matchId) return;
    setMenuVisible(false);
    Alert.alert(
      t('unmatch'),
      t('unmatchConfirmMessage', { name: targetUserName }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('unmatch'),
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const result = await unmatchUser(userId, matchId);
            setLoading(false);

            if (result.success) {
              await successNotification();
              onUnmatch?.();
            } else {
              await errorNotification();
              Alert.alert(t('error'), result.error || t('unmatchError'));
            }
          },
        },
      ]
    );
  };

  const handleReport = () => {
    setMenuVisible(false);
    setReportModalVisible(true);
  };

  const submitReport = async () => {
    if (!selectedReason) return;

    setLoading(true);
    const result = await reportUser(userId, targetUserId, selectedReason);
    setLoading(false);

    if (result.success) {
      await successNotification();
      setReportModalVisible(false);
      setSelectedReason(null);
      Alert.alert(t('reportSubmitted'), t('reportSuccessMessage'));
      onReport?.();
    } else {
      await errorNotification();
      Alert.alert(t('error'), result.error || t('reportError'));
    }
  };

  return (
    <>
      {/* Menu Button */}
      <TouchableOpacity
        onPress={() => setMenuVisible(true)}
        style={styles.menuButton}
        accessibilityLabel={t('moreOptions')}
        accessibilityRole="button"
      >
        <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            {showUnmatch && matchId && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleUnmatch}
              >
                <Ionicons name="heart-dislike-outline" size={22} color="#fff" />
                <Text style={styles.menuItemText}>{t('unmatch')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleBlock}
            >
              <Ionicons name="ban-outline" size={22} color="#FF6B6B" />
              <Text style={[styles.menuItemText, { color: '#FF6B6B' }]}>
                {t('blockUser')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleReport}
            >
              <Ionicons name="flag-outline" size={22} color="#FFA500" />
              <Text style={[styles.menuItemText, { color: '#FFA500' }]}>
                {t('reportUser')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.cancelItem]}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report Modal */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.reportContainer}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>{t('reportUser')}</Text>
              <TouchableOpacity onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.reportSubtitle}>
              {t('reportReasonPrompt', { name: targetUserName })}
            </Text>

            <View style={styles.reasonsList}>
              {reportReasons.map((reason) => (
                <TouchableOpacity
                  key={reason.key}
                  style={[
                    styles.reasonItem,
                    selectedReason === reason.key && styles.reasonItemSelected,
                  ]}
                  onPress={() => setSelectedReason(reason.key)}
                >
                  <Text
                    style={[
                      styles.reasonText,
                      selectedReason === reason.key && styles.reasonTextSelected,
                    ]}
                  >
                    {reason.label}
                  </Text>
                  {selectedReason === reason.key && (
                    <Ionicons name="checkmark-circle" size={22} color="#E94560" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                !selectedReason && styles.submitButtonDisabled,
              ]}
              onPress={submitReport}
              disabled={!selectedReason || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>{t('submitReport')}</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.reportNote}>{t('reportNote')}</Text>
          </View>
        </View>
      </Modal>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#E94560" />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuItemText: {
    color: '#fff',
    fontSize: 17,
    marginLeft: 14,
  },
  cancelItem: {
    borderBottomWidth: 0,
    justifyContent: 'center',
    marginTop: 10,
  },
  cancelText: {
    color: '#888',
    fontSize: 17,
    textAlign: 'center',
  },
  reportContainer: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reportTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  reportSubtitle: {
    color: '#888',
    fontSize: 15,
    marginBottom: 20,
  },
  reasonsList: {
    marginBottom: 20,
  },
  reasonItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    marginBottom: 10,
  },
  reasonItemSelected: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    borderWidth: 1,
    borderColor: '#E94560',
  },
  reasonText: {
    color: '#fff',
    fontSize: 16,
  },
  reasonTextSelected: {
    color: '#E94560',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#E94560',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  submitButtonDisabled: {
    backgroundColor: '#444',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  reportNote: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
