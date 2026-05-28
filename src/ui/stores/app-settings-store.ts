import { createSimpleStore } from './store-core';
import { type Locale, SUPPORTED_LOCALES } from '../../i18n/types';
import type { readLocale, writeLocale } from '../../i18n/locale';

type AppSettingsRuntime = {
  readLocale: typeof readLocale;
  writeLocale: typeof writeLocale;
};

type AppSettingsState = {
  locale: Locale;
  /** 从 chrome.storage.local 加载已保存的 locale */
  loadLocale: () => Promise<void>;
  /** 切换语言并持久化 */
  setLocale: (locale: Locale) => Promise<void>;
};

export function createAppSettingsStore(runtime: AppSettingsRuntime) {
  const store = createSimpleStore<AppSettingsState>({
    locale: 'zh',
    loadLocale: async () => {
      const locale = await runtime.readLocale();
      store.setState({ locale });
    },
    setLocale: async (locale: Locale) => {
      if (!SUPPORTED_LOCALES.includes(locale)) return;
      await runtime.writeLocale(locale);
      store.setState({ locale });
    }
  });
  return store;
}

export type AppSettingsStore = ReturnType<typeof createAppSettingsStore>;
