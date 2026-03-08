import React, { createContext, useContext, useEffect, useState } from 'react';
import i18n, { initializeLanguage, getCurrentLanguage, setLanguage as setI18nLanguage } from '../services/i18n';

type TranslateFunction = (key: string, options?: Record<string, string | number>) => string;

type LanguageContextType = {
  language: string;
  setLanguage: (lang: string) => Promise<void>;
  isLoading: boolean;
  version: number;
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: async () => {},
  isLoading: true,
  version: 0,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState(getCurrentLanguage());
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const init = async () => {
      await initializeLanguage();
      const currentLang = getCurrentLanguage();
      i18n.locale = currentLang;
      setLanguageState(currentLang);
      setIsLoading(false);
    };
    init();
  }, []);

  const setLanguage = async (lang: string) => {
    // Update i18n locale first
    i18n.locale = lang;
    await setI18nLanguage(lang);
    // Update state to trigger re-renders
    setLanguageState(lang);
    // Increment version to force all consumers to re-render
    setVersion(v => v + 1);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isLoading, version }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Custom hook for language and translations
export const useLanguage = () => {
  const context = useContext(LanguageContext);

  // Create t function that always reads current i18n.locale
  const t: TranslateFunction = (key: string, options?: Record<string, string | number>) => {
    // Always read directly from i18n to get current locale translations
    return i18n.t(key, options);
  };

  return {
    language: context.language,
    setLanguage: context.setLanguage,
    isLoading: context.isLoading,
    t
  };
};
