import { afterEach, describe, expect, it, vi } from 'vitest';

const marker = '__BROWSER_HELM_CONTENT_RPC_INSTALLED__';

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[marker];
  vi.unstubAllGlobals();
});

describe('content script config', () => {
  it('injects into all frames at document_start', async () => {
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    const module = await import('../../../src/entrypoints/content');

    expect(module.contentScript).toMatchObject({
      matches: ['<all_urls>'],
      allFrames: true,
      runAt: 'document_start'
    });
  });

  it('registers one content RPC listener when injected repeatedly', async () => {
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    const addListener = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener
        }
      }
    });
    vi.stubGlobal('document', {});
    const module = await import('../../../src/entrypoints/content');

    module.contentScript.main();
    module.contentScript.main();

    expect(addListener).toHaveBeenCalledTimes(1);
  });
});
