import { afterEach, describe, expect, it, vi } from 'vitest';

const marker = '__BROWSER_HELM_CONTENT_RPC_INSTALLED__';
const pageHealthMarker = '__BROWSER_HELM_PAGE_HEALTH_BRIDGE__';

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[marker];
  delete (globalThis as Record<string, unknown>)[pageHealthMarker];
  vi.unstubAllGlobals();
});

describe('content script config', () => {
  it('injects into all frames at document_start', async () => {
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    const module = await import('../../../src/entrypoints/content');

    expect(module.contentScript).toMatchObject({
      matches: ['http://*/*', 'https://*/*'],
      allFrames: true,
      runAt: 'document_start'
    });
    expect(module.contentScript.matches).not.toContain('<all_urls>');
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
    vi.stubGlobal('location', { href: 'https://docs.example.com/page' });
    const module = await import('../../../src/entrypoints/content');

    module.contentScript.main();
    module.contentScript.main();
    await Promise.resolve();
    await Promise.resolve();

    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it('does not install BrowserHelm on restricted banking/payment/medical domains', async () => {
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
    vi.stubGlobal('location', { href: 'https://secure.bank.example/login' });
    const module = await import('../../../src/entrypoints/content');

    module.contentScript.main();
    await Promise.resolve();
    await Promise.resolve();

    expect(addListener).not.toHaveBeenCalled();
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });

  it('does not install when the stored domain policy excludes the current domain', async () => {
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    const addListener = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener
        }
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            browserHelmDomainPolicy: {
              enabledDomains: ['allowed.example']
            }
          }))
        }
      }
    });
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', { href: 'https://blocked.example/page' });
    const module = await import('../../../src/entrypoints/content');

    module.contentScript.main();
    await Promise.resolve();
    await Promise.resolve();

    expect(addListener).not.toHaveBeenCalled();
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });

  it('installs when the stored domain policy explicitly enables the current domain', async () => {
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    const addListener = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener
        }
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            browserHelmDomainPolicy: {
              enabledDomains: ['example.com']
            }
          }))
        }
      }
    });
    vi.stubGlobal('document', {
      documentElement: undefined
    });
    vi.stubGlobal('location', { href: 'https://docs.example.com/page' });
    const module = await import('../../../src/entrypoints/content');

    module.contentScript.main();
    await Promise.resolve();
    await Promise.resolve();

    expect(addListener).toHaveBeenCalledTimes(1);
    expect((globalThis as Record<string, unknown>)[marker]).toBe(true);
  });

  it('injects shallow page-health hooks through a web-accessible script file', async () => {
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    const addListener = vi.fn();
    const appendedScripts: Array<{ id?: string; src?: string; textContent?: string; remove: () => void }> = [];
    const documentElement = {
      appendChild: (node: { id?: string; src?: string; textContent?: string; remove: () => void }) => {
        appendedScripts.push(node);
        return node;
      }
    };
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://browserhelm/${path}`,
        onMessage: {
          addListener
        }
      }
    });
    vi.stubGlobal('window', {
      top: {},
      location: { origin: 'https://docs.example.com' },
      addEventListener: vi.fn(),
      setTimeout: vi.fn()
    });
    vi.stubGlobal('document', {
      documentElement,
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({
        id: '',
        src: '',
        textContent: '',
        remove: vi.fn()
      }))
    });
    vi.stubGlobal('location', { href: 'https://docs.example.com/page' });
    const module = await import('../../../src/entrypoints/content');

    module.contentScript.main();
    await Promise.resolve();
    await Promise.resolve();

    expect(appendedScripts).toHaveLength(1);
    expect(appendedScripts[0]?.id).toBe('browserhelm-page-health-hook');
    expect(appendedScripts[0]?.src).toBe('chrome-extension://browserhelm/page-health-hook.js');
    expect(appendedScripts[0]?.textContent).toBe('');
  });
});
