import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n, { initializeLanguage, getCurrentLanguage, setLanguage as setI18nLanguage, t as translate } from '../services/i18n';
import { syncPreferredLanguage } from '../services/preferredLanguage';

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

  const setLanguage = useCallback(async (lang: string) => {
    // Update i18n locale first
    i18n.locale = lang;
    await setI18nLanguage(lang);
    // Update state to trigger re-renders
    setLanguageState(lang);
    // Increment version to force all consumers to re-render
    setVersion(v => v + 1);
    // Tell the server, so lifecycle email can eventually be written in this
    // language. Deliberately not awaited: the UI must switch instantly, and a
    // preference write is never worth blocking on. Silent on failure.
    void syncPreferredLanguage(lang);
  }, []);

  // Memoize context value to prevent unnecessary re-renders of all consumers
  // when parent re-renders for unrelated reasons
  const contextValue = useMemo(() => ({
    language, setLanguage, isLoading, version,
  }), [language, setLanguage, isLoading, version]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

// Custom hook for language and translations
export const useLanguage = () => {
  const context = useContext(LanguageContext);

  // Delegate to the shared translate helper: it always reads the current
  // i18n.locale and sanitizes i18n-js's '[missing "..." translation]' output
  // to '' so `t(key) || fallback` guards work (see services/i18n.ts).
  const t: TranslateFunction = (key: string, options?: Record<string, string | number>) => {
    return translate(key, options);
  };

  return {
    language: context.language,
    setLanguage: context.setLanguage,
    isLoading: context.isLoading,
    version: context.version,
    t
  };
};
