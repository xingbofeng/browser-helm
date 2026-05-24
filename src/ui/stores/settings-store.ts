import type { RuntimeProviderSettings } from '../../runtime/runtime-messages';
import { maskSensitiveValue } from '../lib/format-tool';
import { createSimpleStore } from './store-core';

type SettingsRuntime = {
  getProviderSettings: () => Promise<RuntimeProviderSettings | undefined>;
  setProviderSettings: (settings: RuntimeProviderSettings) => Promise<void>;
};

export type PolicyPlaceholder = {
  id: string;
  label: string;
  status?: 'reserved' | 'enabled';
};

type SettingsStoreState = {
  settings?: RuntimeProviderSettings | undefined;
  maskedApiKey?: string | undefined;
  policyPlaceholders: PolicyPlaceholder[];
  load: () => Promise<void>;
  save: (settings: RuntimeProviderSettings) => Promise<void>;
};

const policyPlaceholders: PolicyPlaceholder[] = [
  { id: 'read_only_default', label: '默认只读', status: 'reserved' },
  { id: 'confirm_before_submit', label: '提交前确认', status: 'reserved' },
  { id: 'domain_blocklist', label: 'Domain 禁用', status: 'reserved' },
  { id: 'debug_network_read', label: 'Debug/Network 读取', status: 'reserved' }
];

export function createSettingsStore(runtime: SettingsRuntime) {
  const store = createSimpleStore<SettingsStoreState>({
    policyPlaceholders,
    load: async () => {
      const settings = await runtime.getProviderSettings();
      store.setState({
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
    }
  });
  return store;
}
