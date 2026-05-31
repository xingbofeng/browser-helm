import { describe, expect, it } from 'vitest';

import { bhDebugCollectPageHealth } from '../../../../src/tools/debug/bh-debug-collect-page-health';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';

describe('debug read-only tools', () => {
  it('collects page health summary from observation without CDP', async () => {
    const rpc = debugRpc();
    const result = await bhDebugCollectPageHealth(rpc).execute(
      {},
      {
        runId: 'run_1',
        stepId: 'step_1',
        runMode: 'debug'
      }
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      hasForm: true,
      pageStateSummary: '页面包含表单',
      limitations: ['CDP deep inspection unavailable']
    });
    expect(rpc.calls).toEqual([
      CONTENT_RPC_MESSAGES.PAGE_HEALTH_ENABLE,
      CONTENT_RPC_MESSAGES.PAGE_OBSERVE
    ]);
  });

  it('returns shallow console and network signals from observation page health data', async () => {
    const rpc = debugRpc({
      pageHealth: {
        consoleErrors: [
          {
            message: 'Uncaught TypeError',
            source: 'app.js',
            count: 2
          }
        ],
        networkFailures: [
          {
            url: 'https://api.example.com/users',
            method: 'GET',
            errorText: 'Failed to fetch'
          }
        ],
        hasForm: false,
        pageStateSummary: '检测到 1 类 console error 和 1 个 network failure',
        limitations: ['CDP deep inspection unavailable']
      }
    });
    const result = await bhDebugCollectPageHealth(rpc).execute(
      {},
      {
        runId: 'run_1',
        stepId: 'step_1',
        runMode: 'debug'
      }
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      consoleErrors: [
        {
          message: 'Uncaught TypeError',
          source: 'app.js',
          count: 2
        }
      ],
      networkFailures: [
        {
          url: 'https://api.example.com/users',
          method: 'GET',
          errorText: 'Failed to fetch'
        }
      ],
      pageStateSummary: '检测到 1 类 console error 和 1 个 network failure'
    });
    expect(rpc.calls).toEqual([
      CONTENT_RPC_MESSAGES.PAGE_HEALTH_ENABLE,
      CONTENT_RPC_MESSAGES.PAGE_OBSERVE
    ]);
  });
});

function debugRpc(overrides: Record<string, unknown> = {}): ContentRpcClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async request(message) {
      calls.push(message.type);
      if (message.type === CONTENT_RPC_MESSAGES.PAGE_HEALTH_ENABLE) {
        return {
          ok: true,
          enabled: true,
          summary: 'page-health hook enabled'
        };
      }
      expect(message.type).toBe(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
      return {
        ok: true,
        observation: {
          url: 'https://demo.example.com/form',
          title: '表单',
          currentDomain: 'demo.example.com',
          origin: 'https://demo.example.com',
          visibleText: '表单',
          visibleTextSummary: '表单',
          pageStateSummary: '页面包含表单',
          refSummary: [],
          formFields: {
            status: 'ready',
            fields: [],
            count: 0,
            warnings: []
          },
            warnings: [],
            ...overrides
          }
        };
      }
  };
}
