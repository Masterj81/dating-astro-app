import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18n } from 'i18n-js';

// Import translations from JSON files
import ar from '../locales/ar.json';
import de from '../locales/de.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import ja from '../locales/ja.json';
import pt from '../locales/pt.json';
import zh from '../locales/zh.json';

// All translations from JSON files
const translations = {
  en,
  fr,
  es,
  ar,
  de,
  pt,
  ja,
  zh,
};

// Create i18n instance
const i18n = new I18n(translations);
i18n.enableFallback = true;
i18n.defaultLocale = 'en';
i18n.locale = 'en';

// Current language
let currentLanguage = 'en';

// Set language
export const setLanguage = async (lang: string): Promise<void> => {
  currentLanguage = lang;
  i18n.locale = lang;

  // Save preference
  try {
    await AsyncStorage.setItem('preferred_language', lang);
  } catch (e) {
  }
};

// Get current language
export const getCurrentLanguage = () => currentLanguage;

// Get available languages
export const getAvailableLanguages = () => [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

// Initialize language from saved preference
export const initializeLanguage = async () => {
  try {
    const savedLang = await AsyncStorage.getItem('preferred_language');
    if (savedLang && translations[savedLang as keyof typeof translations]) {
      currentLanguage = savedLang;
      i18n.locale = savedLang;
    }
  } catch (e) {
  }
};

// Save language preference (for backward compatibility)
export const saveLanguagePreference = async (lang: string) => {
  // Already saved in setLanguage
};

// Helper function to translate with interpolation
export const t = (key: string, options?: Record<string, string | number>) => {
  return i18n.t(key, options);
};

export default i18n;
