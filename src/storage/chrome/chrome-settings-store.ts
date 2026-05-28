import type {
  ProviderSettings,
  SettingsStore
} from '../interfaces/settings-store';
import {
  BROWSER_HELM_DOMAIN_POLICY_STORAGE_KEY,
  isBrowserHelmDomainPolicy,
  type BrowserHelmDomainPolicy
} from '../../shared/domain-policy';

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
}
