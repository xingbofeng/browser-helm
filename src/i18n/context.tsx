import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { t as translate } from './t';
import { type Locale, type TranslationParams } from './types';


type I18nContextValue = {
  locale: Locale;
  t: (key: string, params?: TranslationParams) => string;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const staticInitialLocale = (): Locale => {
  if (typeof document === 'undefined') return 'zh';
  try {
    const stored = localStorage.getItem('browserhelm.localeCache');
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // ignore
  }
  return 'zh';
};

export type I18nProviderProps = {
  children: ReactNode;
  initialLocale?: Locale | undefined;
};

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale ?? staticInitialLocale()
  );

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    try {
      localStorage.setItem('browserhelm.localeCache', nextLocale);
    } catch {
      // ignore
    }
  }, []);

  const tFn = useCallback(
    (key: string, params?: TranslationParams) =>
      translate(key, locale, params),
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, t: tFn, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useT() must be wrapped in <I18nProvider>');
  }
  return ctx.t;
}

export function useLocale() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useLocale() must be wrapped in <I18nProvider>');
  }
  return ctx.locale;
}

export function useSetLocale() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useSetLocale() must be wrapped in <I18nProvider>');
  }
  return ctx.setLocale;
}
