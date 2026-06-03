import type {
  ProviderSettings,
  SettingsStore
} from '../interfaces/settings-store';
import {
  BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY,
  isBrowserHelmDomainPolicy,
  type BrowserHelmDomainPolicy
} from '../../shared/domain-policy';
import type { AdapterId } from '../../adapters/adapter-types';
import {
  BROWSER_HELM_DOMAIN_ADAPTER_SETTINGS_KEY,
  DEFAULT_DOMAIN_ADAPTER_SETTINGS,
  defaultDomainAdapterPreferences,
  normalizeDomainAdapterSettings,
  type DomainAdapterSettings
} from '../../adapters/preferences';

const PROVIDER_SETTINGS_KEY = 'providerSettings';
const PROVIDER_API_KEY_SESSION_KEY = 'providerApiKey';

export class ChromeSettingsStore implements SettingsStore {
  async getProviderSettings(): Promise<ProviderSettings | undefined> {
    if (!globalThis.chrome?.storage?.local) {
      return undefined;
    }
    const result = await chrome.storage.local.get(PROVIDER_SETTINGS_KEY);
    const settings = result[PROVIDER_SETTINGS_KEY] as ProviderSettings | undefined;
    if (!settings) {
      return undefined;
    }
    if (settings.apiKeyPersistence === 'local' && settings.apiKey) {
      return settings;
    }
    const sessionApiKey = await this.getSessionProviderApiKey();
    return {
      ...withoutApiKey(settings),
      apiKeyPersistence: settings.apiKeyPersistence ?? 'session',
      ...(sessionApiKey ? { apiKey: sessionApiKey } : {})
    };
  }

  async setProviderSettings(settings: ProviderSettings): Promise<void> {
    if (!globalThis.chrome?.storage?.local) {
      return;
    }
    const persistence = settings.apiKeyPersistence ?? 'session';
    if (persistence === 'session') {
      await this.setSessionProviderApiKey(settings.apiKey);
    } else {
      await this.removeSessionProviderApiKey();
    }
    await chrome.storage.local.set({
      [PROVIDER_SETTINGS_KEY]: {
        ...withoutApiKey(settings),
        apiKeyPersistence: persistence,
        ...(persistence === 'local' && settings.apiKey ? { apiKey: settings.apiKey } : {})
      }
    });
  }

  async getDomainPolicy(): Promise<BrowserHelmDomainPolicy | undefined> {
    if (!globalThis.chrome?.storage?.local) {
      return undefined;
    }
    const result = await chrome.storage.local.get(BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY);
    const value = result[BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY];
    return isBrowserHelmDomainPolicy(value) ? value : undefined;
  }

  async setDomainPolicy(policy: BrowserHelmDomainPolicy): Promise<void> {
    if (!globalThis.chrome?.storage?.local) {
      return;
    }
    await chrome.storage.local.set({
      [BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY]: policy
    });
  }

  async getDomainAdapterSettings(): Promise<DomainAdapterSettings | undefined> {
    if (!globalThis.chrome?.storage?.local) {
      return defaultDomainAdapterPreferences.getSettings();
    }
    const result = await chrome.storage.local.get(BROWSER_HELM_DOMAIN_ADAPTER_SETTINGS_KEY);
    const settings = normalizeDomainAdapterSettings(result[BROWSER_HELM_DOMAIN_ADAPTER_SETTINGS_KEY]);
    defaultDomainAdapterPreferences.setSettings(settings);
    return settings;
  }

  async setDomainAdapterEnabled(adapterId: AdapterId, enabled: boolean): Promise<DomainAdapterSettings> {
    const current = await this.getDomainAdapterSettings() ?? DEFAULT_DOMAIN_ADAPTER_SETTINGS;
    defaultDomainAdapterPreferences.setSettings(current);
    const next = defaultDomainAdapterPreferences.setEnabled(adapterId, enabled);
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({
        [BROWSER_HELM_DOMAIN_ADAPTER_SETTINGS_KEY]: next
      });
    }
    return next;
  }

  private async getSessionProviderApiKey(): Promise<string | undefined> {
    if (!globalThis.chrome?.storage?.session) {
      return undefined;
    }
    const result = await chrome.storage.session.get(PROVIDER_API_KEY_SESSION_KEY);
    const value = result[PROVIDER_API_KEY_SESSION_KEY];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private async setSessionProviderApiKey(apiKey: string | undefined): Promise<void> {
    if (!globalThis.chrome?.storage?.session) {
      return;
    }
    if (apiKey?.trim()) {
      await chrome.storage.session.set({ [PROVIDER_API_KEY_SESSION_KEY]: apiKey });
      return;
    }
    await this.removeSessionProviderApiKey();
  }

  private async removeSessionProviderApiKey(): Promise<void> {
    if (!globalThis.chrome?.storage?.session) {
      return;
    }
    await chrome.storage.session.remove(PROVIDER_API_KEY_SESSION_KEY);
  }
}

function withoutApiKey(settings: ProviderSettings): Omit<ProviderSettings, 'apiKey'> {
  const { apiKey, ...rest } = settings;
  void apiKey;
  return rest;
}
