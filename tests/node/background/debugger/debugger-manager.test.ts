import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebuggerManager } from '../../../../src/background/debugger/debugger-manager';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DebuggerManager', () => {
  it('reports attach failure when chrome.debugger is unavailable', async () => {
    const request = vi.fn();
    vi.stubGlobal('chrome', {
      permissions: {
        request
      }
    });
    const manager = new DebuggerManager();

    await expect(manager.attach(12)).resolves.toMatchObject({
      tabId: 12,
      attached: false,
      reason: 'chrome.debugger permission or API is unavailable'
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('attaches, collects network/console events, reads body, and detaches', async () => {
    let eventListener: ((source: chrome.debugger.Debuggee, method: string, params?: object) => void) | undefined;
    const sendCommand = vi.fn(async (_target: chrome.debugger.Debuggee, method: string) => {
      if (method === 'Network.getResponseBody') {
        return {
          body: '{"secret":"sk-1234567890abcdef"}',
          base64Encoded: false
        };
      }
      if (method === 'Performance.getMetrics') {
        return {
          metrics: [{ name: 'Nodes', value: 42 }]
        };
      }
      return {};
    });
    vi.stubGlobal('chrome', {
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        getTargets: vi.fn(async () => [{ id: 'target_1', tabId: 33, type: 'page', title: 'Demo', url: 'https://demo.example.com' }]),
        sendCommand,
        onEvent: {
          addListener: vi.fn((listener: typeof eventListener) => {
            eventListener = listener;
          })
        },
        onDetach: {
          addListener: vi.fn()
        }
      }
    });
    const manager = new DebuggerManager();

    await expect(manager.attach(33)).resolves.toMatchObject({
      tabId: 33,
      attached: true,
      protocolVersion: '1.3'
    });
    expect(manager.isAttached(33)).toBe(true);

    eventListener?.({ tabId: 33 }, 'Network.requestWillBeSent', {
      requestId: 'req_1',
      request: {
        url: 'https://api.example.com/orders?token=secret',
        method: 'GET',
        headers: { Authorization: 'Bearer secret' }
      }
    });
    eventListener?.({ tabId: 33 }, 'Network.responseReceived', {
      requestId: 'req_1',
      response: {
        url: 'https://api.example.com/orders?token=secret',
        status: 404,
        headers: { Cookie: 'sid=secret' }
      }
    });
    eventListener?.({ tabId: 33 }, 'Runtime.consoleAPICalled', {
      type: 'error',
      args: [{ value: 'failed with sk-1234567890abcdef' }]
    });

    expect(manager.networkEvents(33)[0]).toMatchObject({
      status: 404,
      requestHeadersPreview: { Authorization: '[MASKED]' },
      responseHeadersPreview: { Cookie: '[MASKED]' }
    });
    expect(manager.consoleEvents(33, 1)[0]?.text).toContain('[MASKED]');
    const detail = await manager.requestDetail(33, 'req_1');
    expect(detail?.responseBodyPreview).toContain('[MASKED]');
    expect(await manager.performanceMetrics(33)).toMatchObject({
      tabId: 33,
      metrics: [{ name: 'Nodes', value: 42 }]
    });
    await expect(manager.targets()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ tabId: 33 })
    ]));
    await expect(manager.detach(33)).resolves.toMatchObject({
      tabId: 33,
      attached: false
    });
    expect(manager.isAttached(33)).toBe(false);
  });

  it('tracks auditable session lifecycle and keeps one BrowserHelm session per tab', async () => {
    let eventListener: ((source: chrome.debugger.Debuggee, method: string, params?: object) => void) | undefined;
    let detachListener: ((source: chrome.debugger.Debuggee, reason?: string) => void) | undefined;
    const attach = vi.fn(async () => undefined);
    const detach = vi.fn(async () => undefined);
    const sendCommand = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', {
      debugger: {
        attach,
        detach,
        getTargets: vi.fn(async () => []),
        sendCommand,
        onEvent: {
          addListener: vi.fn((listener: typeof eventListener) => {
            eventListener = listener;
          })
        },
        onDetach: {
          addListener: vi.fn((listener: typeof detachListener) => {
            detachListener = listener;
          })
        }
      }
    });
    const manager = new DebuggerManager();

    await manager.attach(44);
    await manager.attach(44);
    eventListener?.({ tabId: 44 }, 'Runtime.consoleAPICalled', {
      type: 'error',
      args: [{ value: 'failed' }]
    });
    eventListener?.({ tabId: 44 }, 'Network.requestWillBeSent', {
      requestId: 'req_1',
      request: {
        url: 'https://api.example.com/data',
        method: 'GET',
        headers: {}
      }
    });
    expect(manager.networkEvents(44)).toHaveLength(1);
    detachListener?.({ tabId: 44 }, 'target_closed');

    expect(attach).toHaveBeenCalledTimes(1);
    expect(manager.sessionState(44)).toMatchObject({
      tabId: 44,
      owner: 'browserhelm',
      attached: false,
      detachReason: 'target_closed',
      enabledDomains: ['Network', 'Runtime', 'Performance']
    });
    expect(manager.sessionState(44)?.createdAt).toBeTypeOf('number');
    expect(manager.sessionState(44)?.lastEventAt).toBeTypeOf('number');
    expect(manager.networkEvents(44)).toEqual([]);
    expect(manager.isAttached(44)).toBe(false);
  });

  it('marks a debugger session detached when the tab closes', async () => {
    let tabRemovedListener: ((tabId: number) => void) | undefined;
    vi.stubGlobal('chrome', {
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        sendCommand: vi.fn(async () => ({})),
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      },
      tabs: {
        onRemoved: {
          addListener: vi.fn((listener: typeof tabRemovedListener) => {
            tabRemovedListener = listener;
          })
        }
      }
    });
    const manager = new DebuggerManager();

    await manager.attach(55);
    tabRemovedListener?.(55);

    expect(manager.isAttached(55)).toBe(false);
    expect(manager.sessionState(55)).toMatchObject({
      tabId: 55,
      attached: false,
      detachReason: 'tab_closed'
    });
  });

  it('automatically detaches debugger sessions after the configured TTL', async () => {
    vi.useFakeTimers();
    const detach = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      debugger: {
        attach: vi.fn(async () => undefined),
        detach,
        sendCommand: vi.fn(async () => ({})),
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      },
      tabs: {
        onRemoved: { addListener: vi.fn() }
      }
    });
    const manager = new DebuggerManager({ sessionTtlMs: 1_000 });

    await manager.attach(66);
    expect(manager.isAttached(66)).toBe(true);

    await vi.advanceTimersByTimeAsync(1_001);

    expect(detach).toHaveBeenCalledWith({ tabId: 66 });
    expect(manager.isAttached(66)).toBe(false);
    expect(manager.sessionState(66)).toMatchObject({
      tabId: 66,
      attached: false,
      detachReason: 'ttl_expired'
    });
  });

  it('reuses same-tab debugger sessions and refreshes their TTL without reattaching', async () => {
    vi.useFakeTimers();
    const attach = vi.fn(async () => undefined);
    const detach = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      debugger: {
        attach,
        detach,
        sendCommand: vi.fn(async () => ({})),
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      },
      tabs: {
        onRemoved: { addListener: vi.fn() }
      }
    });
    const manager = new DebuggerManager({ sessionTtlMs: 1_000 });

    await manager.attach(77);
    await vi.advanceTimersByTimeAsync(900);
    await manager.attach(77);
    await vi.advanceTimersByTimeAsync(200);

    expect(attach).toHaveBeenCalledTimes(1);
    expect(manager.isAttached(77)).toBe(true);

    await vi.advanceTimersByTimeAsync(801);

    expect(detach).toHaveBeenCalledWith({ tabId: 77 });
    expect(manager.sessionState(77)).toMatchObject({
      tabId: 77,
      attached: false,
      detachReason: 'ttl_expired'
    });
  });
});
