import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebuggerManager } from '../../../../src/background/debugger/debugger-manager';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DebuggerManager', () => {
  it('reports attach failure when chrome.debugger is unavailable', async () => {
    vi.stubGlobal('chrome', {});
    const manager = new DebuggerManager();

    await expect(manager.attach(12)).resolves.toMatchObject({
      tabId: 12,
      attached: false,
      reason: 'chrome.debugger permission or API is unavailable'
    });
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
});
