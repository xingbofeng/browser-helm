import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChromeSettingsStore } from '../../../src/storage/chrome/chrome-settings-store';

describe('ChromeSettingsStore provider secrets', () => {
  let localData: Record<string, unknown>;
  let sessionData: Record<string, unknown>;

  beforeEach(() => {
    localData = {};
    sessionData = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: localData[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            Object.assign(localData, value);
          })
        },
        session: {
          get: vi.fn(async (key: string) => ({ [key]: sessionData[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            Object.assign(sessionData, value);
          }),
          remove: vi.fn(async (key: string) => {
            delete sessionData[key];
          })
        }
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores provider API keys in session storage by default, not chrome.storage.local', async () => {
    const store = new ChromeSettingsStore();

    await store.setProviderSettings({
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      apiKey: 'sk-session-secret'
    });

    expect(JSON.stringify(localData)).not.toContain('sk-session-secret');
    expect(JSON.stringify(sessionData)).toContain('sk-session-secret');
    await expect(store.getProviderSettings()).resolves.toMatchObject({
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      apiKey: 'sk-session-secret',
      apiKeyPersistence: 'session'
    });
  });

  it('downgrades local provider API key persistence to session by default', async () => {
    const store = new ChromeSettingsStore();

    await store.setProviderSettings({
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      apiKey: 'sk-local-secret',
      apiKeyPersistence: 'local'
    });

    expect(JSON.stringify(localData)).not.toContain('sk-local-secret');
    expect(JSON.stringify(sessionData)).toContain('sk-local-secret');
    await expect(store.getProviderSettings()).resolves.toMatchObject({
      apiKey: 'sk-local-secret',
      apiKeyPersistence: 'session'
    });
  });

  it('persists provider API keys locally only when storage policy explicitly allows it', async () => {
    const store = new ChromeSettingsStore({ allowLocalApiKeyPersistence: true });

    await store.setProviderSettings({
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      apiKey: 'sk-local-secret',
      apiKeyPersistence: 'local'
    });

    expect(JSON.stringify(localData)).toContain('sk-local-secret');
    expect(JSON.stringify(sessionData)).not.toContain('sk-local-secret');
    await expect(store.getProviderSettings()).resolves.toMatchObject({
      apiKey: 'sk-local-secret',
      apiKeyPersistence: 'local'
    });
  });

  it('keeps non-secret provider fields compatible when no API key is supplied', async () => {
    const store = new ChromeSettingsStore();

    await store.setProviderSettings({
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      streamingEnabled: true
    });

    expect(localData.providerSettings).toEqual({
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      streamingEnabled: true,
      apiKeyPersistence: 'session'
    });
    await expect(store.getProviderSettings()).resolves.toMatchObject({
      baseUrl: 'https://api.example.com/v1',
      model: 'demo-model',
      streamingEnabled: true
    });
  });
});
