import type { RuntimeProviderSettings } from '../../runtime/runtime-messages';
import type { BrowserHelmDomainPolicy } from '../../shared/domain-policy';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';
import { maskSensitiveValue } from '../lib/format-tool';
import { createSimpleStore } from './store-core';

type SettingsRuntime = {
  getProviderSettings: () => Promise<RuntimeProviderSettings | undefined>;
  setProviderSettings: (settings: RuntimeProviderSettings) => Promise<void>;
  getDomainPolicy?: () => Promise<BrowserHelmDomainPolicy | undefined>;
  setDomainPolicy?: (policy: BrowserHelmDomainPolicy) => Promise<void>;
};

export type PolicyPlaceholder = {
  id: string;
  label: string;
  status?: 'reserved' | 'enabled';
};

type SettingsStoreState = {
  settings?: RuntimeProviderSettings | undefined;
  domainPolicy?: BrowserHelmDomainPolicy | undefined;
  maskedApiKey?: string | undefined;
  policyPlaceholders: PolicyPlaceholder[];
  load: () => Promise<void>;
  save: (settings: RuntimeProviderSettings) => Promise<void>;
  saveDomainPolicy: (policy: BrowserHelmDomainPolicy) => Promise<void>;
};

const POLICY_LABEL_KEYS = {
  read_only_default: 'settings.policy.readOnlyDefault',
  confirm_before_submit: 'settings.policy.confirmBeforeSubmit',
  domain_policy: 'settings.policy.domainBlocklist',
  debug_network_read: 'settings.policy.debugNetworkRead'
} as const;

function buildPolicyPlaceholders(locale: Locale): PolicyPlaceholder[] {
  return [
    { id: 'read_only_default', label: t(POLICY_LABEL_KEYS.read_only_default, locale), status: 'reserved' },
    { id: 'confirm_before_submit', label: t(POLICY_LABEL_KEYS.confirm_before_submit, locale), status: 'reserved' },
    { id: 'domain_policy', label: t(POLICY_LABEL_KEYS.domain_policy, locale), status: 'enabled' },
    { id: 'debug_network_read', label: t(POLICY_LABEL_KEYS.debug_network_read, locale), status: 'reserved' }
  ];
}

export function createSettingsStore(runtime: SettingsRuntime, locale: Locale) {
  const policyPlaceholders = buildPolicyPlaceholders(locale);
  const store = createSimpleStore<SettingsStoreState>({
    policyPlaceholders,
    load: async () => {
      const settings = await runtime.getProviderSettings();
      const domainPolicy = await runtime.getDomainPolicy?.();
      store.setState({
        domainPolicy,
        settings,
        maskedApiKey: settings?.apiKey ? maskSensitiveValue(settings.apiKey) : undefined
      });
    },
    save: async (settings) => {
      const current = store.getState().settings;
      const nextSettings = {
        ...settings,
        ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
        ...(!settings.apiKey && current?.apiKey
          ? { apiKey: current.apiKey }
          : {})
      };
      await runtime.setProviderSettings(nextSettings);
      store.setState({
        settings: nextSettings,
        maskedApiKey: nextSettings.apiKey ? maskSensitiveValue(nextSettings.apiKey) : undefined
      });
    },
    saveDomainPolicy: async (policy) => {
      await runtime.setDomainPolicy?.(policy);
      store.setState({ domainPolicy: policy });
    }
  });
  return store;
}
