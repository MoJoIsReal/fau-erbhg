import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, useTranslation } from '@/lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: ReturnType<typeof useTranslation>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    // Try to get saved language from localStorage, default to Norwegian
    const saved = localStorage.getItem('fau-language');
    return (saved === 'en' || saved === 'no') ? saved : 'no';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('fau-language', lang);
  };

  const t = useTranslation(language);

  useEffect(() => {
    // Update document lang attribute for accessibility
    document.documentElement.lang = language === 'no' ? 'nb' : 'en';
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}