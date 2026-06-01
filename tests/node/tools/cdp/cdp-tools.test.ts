import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bhCdpAttach,
  bhCdpDetach,
  bhCdpGetEventListeners,
  bhCdpGetPerformanceMetrics,
  bhCdpGetRequestDetail,
  bhCdpGetResponseBody
} from '../../../../src/tools/cdp/bh-cdp-tools';
import { defaultDebuggerManager } from '../../../../src/background/debugger/debugger-manager';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CDP tools', () => {
  it('returns an actionable failure when debugger permission/API is unavailable', async () => {
    vi.stubGlobal('chrome', {});

    const result = await bhCdpAttach(rpc()).execute(
      { tabId: 41 },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.RUNTIME_UNAVAILABLE,
      changedPage: false,
      requiresObserve: false
    });
    expect(result.summary).toContain('Debugger attach failed');
    expect(result.data).toMatchObject({
      state: {
        tabId: 41,
        attached: false,
        reason: 'chrome.debugger permission or API is unavailable'
      }
    });
  });

  it('attaches and detaches the resolved tab', async () => {
    const attach = vi.fn(async () => undefined);
    const detach = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      debugger: {
        attach,
        detach,
        sendCommand: vi.fn(async () => ({})),
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      }
    });

    const attachResult = await bhCdpAttach(rpc()).execute(
      {},
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug', tabId: 42 }
    );
    const detachResult = await bhCdpDetach(rpc()).execute(
      {},
      { runId: 'run_1', stepId: 'step_2', runMode: 'debug', tabId: 42 }
    );

    expect(attach).toHaveBeenCalledWith({ tabId: 42 }, '1.3');
    expect(detach).toHaveBeenCalledWith({ tabId: 42 });
    expect(attachResult.ok).toBe(true);
    expect(detachResult.ok).toBe(true);
  });

  it('returns explicit response-body unavailable reason', async () => {
    vi.stubGlobal('chrome', {
      debugger: {
        sendCommand: vi.fn(async () => {
          throw new Error('No resource with given identifier found');
        })
      }
    });

    const result = await bhCdpGetResponseBody(rpc()).execute(
      { tabId: 43, requestId: 'req_missing' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.OBSERVATION_FAILED,
      data: {
        tabId: 43,
        requestId: 'req_missing',
        unavailableReason: 'No resource with given identifier found'
      }
    });
  });

  it('redacts sensitive response body text before returning tool data', async () => {
    vi.stubGlobal('chrome', {
      debugger: {
        sendCommand: vi.fn(async () => ({
          body: '{"apiKey":"sk-1234567890abcdef"}',
          base64Encoded: false
        }))
      }
    });

    const result = await bhCdpGetResponseBody(rpc()).execute(
      { tabId: 44, requestId: 'req_1' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug' }
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      tabId: 44,
      requestId: 'req_1',
      base64Encoded: false
    });
    expect(typeof result.data === 'object' && result.data !== null && 'body' in result.data
      ? result.data.body
      : undefined).toContain('[MASKED]');
  });

  it('returns request detail with sanitized headers and body previews', async () => {
    vi.stubGlobal('chrome', {
      debugger: {
        sendCommand: vi.fn(async (_target, method) => {
          if (method === 'Network.getResponseBody') {
            return {
              body: '{"token":"sk-1234567890abcdef"}',
              base64Encoded: false
            };
          }
          return {};
        }),
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      }
    });

    await bhCdpAttach(rpc()).execute(
      { tabId: 45 },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug' }
    );
    const network = readNetworkStore(45);
    network.requestWillBeSent({
      requestId: 'req_detail',
      request: {
        url: 'https://api.example.com/data?token=secret#frag',
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token' },
        postData: 'password=hunter2'
      }
    });
    network.responseReceived({
      requestId: 'req_detail',
      response: {
        url: 'https://api.example.com/data?token=secret#frag',
        status: 500,
        mimeType: 'application/json',
        headers: { 'Set-Cookie': 'sid=secret' }
      }
    });

    const result = await bhCdpGetRequestDetail(rpc()).execute(
      { tabId: 45, requestId: 'req_detail' },
      { runId: 'run_1', stepId: 'step_2', runMode: 'debug' }
    );

    expect(result.ok).toBe(true);
    const text = JSON.stringify(result.data);
    expect(text).toContain('[MASKED]');
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('token=secret');
    expect(text).not.toContain('hunter2');
  });

  it('reads performance metrics through CDP', async () => {
    vi.stubGlobal('chrome', {
      debugger: {
        sendCommand: vi.fn(async (_target, method) => method === 'Performance.getMetrics'
          ? { metrics: [{ name: 'TaskDuration', value: 12.5 }] }
          : {}),
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      }
    });

    const result = await bhCdpGetPerformanceMetrics(rpc()).execute(
      { tabId: 46 },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug' }
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        snapshot: {
          tabId: 46,
          metrics: [{ name: 'TaskDuration', value: 12.5 }]
        }
      }
    });
  });

  it('reads event listener metadata without source editing', async () => {
    vi.stubGlobal('chrome', {
      debugger: {
        sendCommand: vi.fn(async (_target, method) => {
          if (method === 'Runtime.evaluate') {
            return { result: { objectId: 'object_1' } };
          }
          if (method === 'DOMDebugger.getEventListeners') {
            return {
              listeners: [{
                type: 'click',
                useCapture: false,
                passive: true,
                once: false,
                scriptId: '7',
                lineNumber: 10,
                columnNumber: 2
              }]
            };
          }
          return {};
        })
      }
    });

    const result = await bhCdpGetEventListeners(rpc()).execute(
      { tabId: 47, objectExpression: 'document' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug' }
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        tabId: 47,
        listeners: [expect.objectContaining({ type: 'click', passive: true })]
      }
    });
  });
});

function readNetworkStore(tabId: number): {
  requestWillBeSent(payload: Record<string, unknown>): void;
  responseReceived(payload: Record<string, unknown>): void;
} {
  defaultDebuggerManager.networkEvents(tabId);
  const manager = defaultDebuggerManager as unknown as {
    sessions: Map<number, { network: {
      requestWillBeSent(payload: Record<string, unknown>): void;
      responseReceived(payload: Record<string, unknown>): void;
    } }>;
  };
  const session = manager.sessions.get(tabId);
  if (!session) {
    throw new Error(`Expected debugger session for tab ${tabId}`);
  }
  return session.network;
}

function rpc(): ContentRpcClient {
  return {
    async request() {
      return { ok: false, code: 'CONTENT_SCRIPT_UNAVAILABLE', message: 'unused' };
    }
  };
}
