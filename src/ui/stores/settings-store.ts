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
  { id: 'read_only_default', label: '默认只读' },
  { id: 'confirm_before_submit', label: '提交前确认' },
  { id: 'domain_blocklist', label: 'domain 禁用' },
  { id: 'debug_network_read', label: 'debug/network 读取' }
];

export function createSettingsStore(runtime: SettingsRuntime) {
  const state: SettingsStoreState = {
    policyPlaceholders,
    load: async () => {
      const settings = await runtime.getProviderSettings();
      state.settings = settings;
      state.maskedApiKey = settings?.apiKey
        ? maskSensitiveValue(settings.apiKey)
        : undefined;
    },
    save: async (settings) => {
      await runtime.setProviderSettings(settings);
      state.settings = settings;
      state.maskedApiKey = settings.apiKey
        ? maskSensitiveValue(settings.apiKey)
        : undefined;
    }
  };
  return createSimpleStore(state);
}
