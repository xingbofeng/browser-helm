import { describe, expect, it } from 'vitest';

import { createSettingsStore } from '../../../../src/ui/stores/settings-store';

describe('settings store', () => {
  it('saves provider settings with masked key preview and exposes policy placeholders', async () => {
    const saved: unknown[] = [];
    const store = createSettingsStore({
      getProviderSettings: async () => ({
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: 'sk-secret-1234'
      }),
      setProviderSettings: async (settings) => {
        saved.push(settings);
      }
    });

    await store.getState().load();
    await store.getState().save({
      baseUrl: 'https://api.next.example.com/v1',
      model: 'gpt-next',
      apiKey: 'sk-secret-5678'
    });

    expect(store.getState().maskedApiKey).toBe('sk-...5678');
    expect(store.getState().policyPlaceholders.map((item) => item.id)).toEqual([
      'read_only_default',
      'confirm_before_submit',
      'domain_blocklist',
      'debug_network_read'
    ]);
    expect(saved).toEqual([
      {
        baseUrl: 'https://api.next.example.com/v1',
        model: 'gpt-next',
        apiKey: 'sk-secret-5678'
      }
    ]);
  });
});
