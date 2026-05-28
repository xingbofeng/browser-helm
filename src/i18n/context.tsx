import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** The resolved locale from chrome.storage.local. The provider synchronises
   *  to this prop via useEffect so it picks up async resolution after the
   *  initial mount. Callers may still guard with a loading state
   *  (e.g. `if (!locale) return null`) to avoid a static-fallback flash. */
  initialLocale?: Locale | undefined;
};

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale ?? staticInitialLocale()
  );

  // Track initialLocale across renders so we can respond to async resolution
  // without a derived-state-in-render anti-pattern.
  const prevInitialLocale = useRef(initialLocale);
  useEffect(() => {
    if (initialLocale && initialLocale !== prevInitialLocale.current) {
      prevInitialLocale.current = initialLocale;
      setLocaleState(initialLocale);
    }
  }, [initialLocale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    try {
      localStorage.setItem('browserhelm.localeCache', nextLocale);
    } catch {
      // ignore
    }
    // Also write to chrome.storage.local as the canonical source of truth.
    // Use globalThis.chrome to avoid ReferenceError in non-Chrome environments.
    const g = globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: { get(k: string): Promise<Record<string, unknown>>; set(v: Record<string, unknown>): Promise<void> } } };
    };
    if (typeof g.chrome?.storage?.local?.set === 'function') {
      void g.chrome.storage.local.get('appSettings').then((result) => {
        const existing = (result?.appSettings as Record<string, unknown> | undefined) ?? {};
        void g.chrome.storage.local.set({ appSettings: { ...existing, locale: nextLocale } });
      }).catch(() => {
        // ignore storage write failures
      });
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
