import type {
  ProviderSettings,
  SettingsStore
} from '../interfaces/settings-store';

const PROVIDER_SETTINGS_KEY = 'providerSettings';

export class ChromeSettingsStore implements SettingsStore {
  async getProviderSettings(): Promise<ProviderSettings | undefined> {
    if (!globalThis.chrome?.storage?.local) {
      return undefined;
    }
    const result = await chrome.storage.local.get(PROVIDER_SETTINGS_KEY);
    return result[PROVIDER_SETTINGS_KEY] as ProviderSettings | undefined;
  }

  async setProviderSettings(settings: ProviderSettings): Promise<void> {
    if (!globalThis.chrome?.storage?.local) {
      return;
    }
    await chrome.storage.local.set({
      [PROVIDER_SETTINGS_KEY]: settings
    });
  }
}
