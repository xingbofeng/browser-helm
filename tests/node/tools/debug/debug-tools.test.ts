import { describe, expect, it } from 'vitest';

import { bhDebugCollectPageHealth } from '../../../../src/tools/debug/bh-debug-collect-page-health';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';

describe('v1.0 debug read-only tools', () => {
  it('collects page health summary from observation without CDP', async () => {
    const result = await bhDebugCollectPageHealth(debugRpc()).execute(
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
      limitations: ['Console/network shallow signals are unavailable from content RPC']
    });
  });
});

function debugRpc(): ContentRpcClient {
  return {
    async request(message) {
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
          warnings: []
        }
      };
    }
  };
}
