import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bhCdpAttach,
  bhCdpDetach,
  bhCdpGetResponseBody
} from '../../../../src/tools/cdp/bh-cdp-tools';
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
});

function rpc(): ContentRpcClient {
  return {
    async request() {
      return { ok: false, code: 'CONTENT_SCRIPT_UNAVAILABLE', message: 'unused' };
    }
  };
}
