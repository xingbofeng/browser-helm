// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const CONTENT_SCRIPT_INSTALLED_MARKER = '__BROWSER_HELM_CONTENT_RPC_INSTALLED__';

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[CONTENT_SCRIPT_INSTALLED_MARKER];
  vi.unstubAllGlobals();
});

describe('content script floating panel', () => {
  it('不会在非 top frame 中创建 floating host', async () => {
    const addListener = vi.fn();
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener },
        getURL: vi.fn().mockReturnValue('chrome-extension://test/icons/icon-48.png')
      }
    });

    // 模拟 non-top frame: window.top !== window
    Object.defineProperty(window, 'top', { value: {}, writable: true, configurable: true });

    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        id: '',
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        attachShadow: vi.fn().mockReturnValue({
          querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }),
          querySelectorAll: vi.fn().mockReturnValue([]),
          innerHTML: ''
        }),
        appendTo: vi.fn(),
        append: vi.fn()
      }),
      getElementById: vi.fn().mockReturnValue(null),
      documentElement: { tagName: 'HTML', append: vi.fn() }
    });

    const module = await import('../../../src/entrypoints/content');
    module.contentScript.main();

    expect(addListener).toHaveBeenCalled();
  });

  it('top frame 中创建 floating host (singleton)', async () => {
    const addListener = vi.fn();
    const mockAppend = vi.fn();
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener },
        getURL: vi.fn().mockReturnValue('chrome-extension://test/icons/icon-48.png')
      }
    });

    // 模拟 top frame: window.top === window
    Object.defineProperty(window, 'top', { value: window, writable: true, configurable: true });
    Object.defineProperty(window, 'location', { value: { origin: 'http://example.com' }, writable: true, configurable: true });

    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        id: '',
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        attachShadow: vi.fn().mockReturnValue({
          querySelector: vi.fn().mockReturnValue(null),
          querySelectorAll: vi.fn().mockReturnValue([]),
          innerHTML: '',
          addEventListener: vi.fn()
        }),
        appendTo: vi.fn(),
        append: vi.fn()
      }),
      getElementById: vi.fn().mockReturnValue(null),
      documentElement: { tagName: 'HTML', append: mockAppend }
    });

    const module = await import('../../../src/entrypoints/content');
    module.contentScript.main();

    expect(mockAppend).toHaveBeenCalled();
    expect(addListener).toHaveBeenCalled();
  });

  it('重复调用 main 不重复安装监听器', async () => {
    const addListener = vi.fn();
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    vi.stubGlobal('chrome', {
      runtime: { onMessage: { addListener } }
    });
    vi.stubGlobal('document', {});

    const module = await import('../../../src/entrypoints/content');
    module.contentScript.main();
    module.contentScript.main();
    module.contentScript.main();

    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it('已存在 floating host 时不重复创建', async () => {
    const addListener = vi.fn();
    const getElementByIdFn = vi.fn().mockReturnValue({});
    const createElementFn = vi.fn();
    vi.stubGlobal('defineContentScript', (config: unknown) => config);
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener },
        getURL: vi.fn().mockReturnValue('chrome-extension://test/icons/icon-48.png')
      }
    });

    Object.defineProperty(window, 'top', { value: window, writable: true, configurable: true });
    Object.defineProperty(window, 'location', { value: { origin: 'http://example.com' }, writable: true, configurable: true });

    vi.stubGlobal('document', {
      createElement: createElementFn,
      getElementById: getElementByIdFn,
      documentElement: { tagName: 'HTML', append: vi.fn() }
    });

    const module = await import('../../../src/entrypoints/content');
    module.contentScript.main();

    expect(getElementByIdFn).toHaveBeenCalledWith('browserhelm-floating-entry-host');
    expect(createElementFn).not.toHaveBeenCalled();
  });
});
