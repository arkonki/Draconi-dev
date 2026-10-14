import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ET } from './et';

// A small translation layer for the Solo screens. The English text itself is the key, so the code stays readable and
// anything without a translation simply shows in English. Placeholders look like {name}. Translations are plain data in
// `et.ts`, easy to correct by anyone who reads Estonian.

export type ScreenLanguage = 'en' | 'et';
export type ScreenLanguagePreference = 'same' | ScreenLanguage;

const DICTIONARIES: Record<ScreenLanguage, Record<string, string>> = { en: {}, et: ET };

export function translate(language: ScreenLanguage, text: string, values?: Record<string, string | number>): string {
  const base = DICTIONARIES[language][text] ?? text;
  return values ? base.replace(/\{(\w+)\}/g, (placeholder, key: string) => (values[key] === undefined ? placeholder : String(values[key]))) : base;
}

/** Marks a string that is translated later, where it is shown (for text kept in module-level constants). */
export const tr = (text: string): string => text;

export type Translator = (text: string, values?: Record<string, string | number>) => string;

export function createTranslator(language: ScreenLanguage): Translator {
  return (text, values) => translate(language, text, values);
}

const ScreenLanguageContext = createContext<ScreenLanguage>('en');
export const ScreenLanguageProvider = ScreenLanguageContext.Provider;

/** The translator for the screen language of the surrounding Solo page. */
export function useT(): Translator {
  const language = useContext(ScreenLanguageContext);
  return useMemo(() => createTranslator(language), [language]);
}

export const useScreenLanguageValue = () => useContext(ScreenLanguageContext);

const PREFERENCE_KEY = 'solo-screen-language';
const readPreference = (): ScreenLanguagePreference => {
  try {
    const stored = window.localStorage.getItem(PREFERENCE_KEY);
    return stored === 'en' || stored === 'et' ? stored : 'same';
  } catch {
    return 'same';
  }
};

/**
 * Which language the Solo screens use for this person: their own choice, or by default the language the campaign's story
 * is told in. The choice is remembered in this browser only.
 */
export function useScreenLanguage(storyLanguage: ScreenLanguage | undefined): {
  language: ScreenLanguage;
  preference: ScreenLanguagePreference;
  setPreference: (value: ScreenLanguagePreference) => void;
} {
  const [preference, setPreferenceState] = useState<ScreenLanguagePreference>(readPreference);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === PREFERENCE_KEY) setPreferenceState(readPreference()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const setPreference = useCallback((value: ScreenLanguagePreference) => {
    setPreferenceState(value);
    try { window.localStorage.setItem(PREFERENCE_KEY, value); } catch { /* the choice is just not remembered */ }
  }, []);
  const language: ScreenLanguage = preference === 'same' ? (storyLanguage ?? 'en') : preference;
  return { language, preference, setPreference };
}
