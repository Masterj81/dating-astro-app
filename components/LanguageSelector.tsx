import { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
import { getAvailableLanguages } from '../services/i18n';

type Props = {
  onLanguageChange?: () => void;
};

export default function LanguageSelector({ onLanguageChange }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingLang, setLoadingLang] = useState<string | null>(null);

  const { language, setLanguage, t } = useLanguage();
  const languages = getAvailableLanguages();
  const currentLanguage = languages.find(l => l.code === language) || languages[0];

  const handleSelectLanguage = async (langCode: string) => {
    if (langCode === language) {
      setModalVisible(false);
      return;
    }

    setLoading(true);
    setLoadingLang(langCode);

    try {
      await setLanguage(langCode);
      setModalVisible(false);
      onLanguageChange?.();
    } catch (error) {
      console.log('Error changing language:', error);
    }

    setLoading(false);
    setLoadingLang(null);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.selector}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.flag}>{currentLanguage.flag}</Text>
        <Text style={styles.langName}>{currentLanguage.name}</Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !loading && setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !loading && setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('selectLanguage')}</Text>

            {languages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langOption,
                  language === lang.code && styles.langOptionActive
                ]}
                onPress={() => handleSelectLanguage(lang.code)}
                disabled={loading}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[
                  styles.langText,
                  language === lang.code && styles.langTextActive
                ]}>
                  {lang.name}
                </Text>
                {loadingLang === lang.code ? (
                  <ActivityIndicator size="small" color="#e94560" />
                ) : language === lang.code ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : null}
              </TouchableOpacity>
            ))}

            {loading && (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>{t('translating')}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
  },
  flag: {
    fontSize: 18,
  },
  langName: {
    color: '#fff',
    fontSize: 14,
  },
  arrow: {
    color: '#888',
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 340,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  langOptionActive: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
  },
  langFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  langText: {
    color: '#ccc',
    fontSize: 16,
    flex: 1,
  },
  langTextActive: {
    color: '#e94560',
    fontWeight: '600',
  },
  checkmark: {
    color: '#e94560',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
});
