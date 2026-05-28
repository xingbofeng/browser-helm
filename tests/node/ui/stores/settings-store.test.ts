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
      getDomainPolicy: async () => ({
        enabledDomains: ['example.com']
      }),
      setProviderSettings: async (settings) => {
        saved.push(settings);
      },
      setDomainPolicy: async (policy) => {
        saved.push(policy);
      }
    }, 'zh');

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
      'domain_policy',
      'debug_network_read'
    ]);
    expect(store.getState().domainPolicy).toEqual({ enabledDomains: ['example.com'] });
    expect(saved).toEqual([
      {
        baseUrl: 'https://api.next.example.com/v1',
        model: 'gpt-next',
        apiKey: 'sk-secret-5678'
      }
    ]);
  });

  it('saves explicit domain policy settings', async () => {
    const saved: unknown[] = [];
    const store = createSettingsStore({
      getProviderSettings: async () => undefined,
      setProviderSettings: async () => undefined,
      getDomainPolicy: async () => undefined,
      setDomainPolicy: async (policy) => {
        saved.push(policy);
      }
    }, 'zh');

    await store.getState().saveDomainPolicy({
      enabledDomains: ['example.com'],
      blockedDomains: ['blocked.example'],
      defaultEnabled: false
    });

    expect(store.getState().domainPolicy).toEqual({
      enabledDomains: ['example.com'],
      blockedDomains: ['blocked.example'],
      defaultEnabled: false
    });
    expect(saved).toEqual([
      {
        enabledDomains: ['example.com'],
        blockedDomains: ['blocked.example'],
        defaultEnabled: false
      }
    ]);
  });

  it('preserves the loaded API key when saving provider settings without a new key', async () => {
    const saved: unknown[] = [];
    const store = createSettingsStore({
      getProviderSettings: async () => ({
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: 'sk-existing-secret'
      }),
      setProviderSettings: async (settings) => {
        saved.push(settings);
      }
    }, 'zh');

    await store.getState().load();
    await store.getState().save({
      baseUrl: 'https://api.next.example.com/v1',
      model: 'gpt-next'
    });

    expect(store.getState().maskedApiKey).toBe('sk-...cret');
    expect(saved).toEqual([
      {
        baseUrl: 'https://api.next.example.com/v1',
        model: 'gpt-next',
        apiKey: 'sk-existing-secret'
      }
    ]);
  });
});
