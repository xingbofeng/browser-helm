import { describe, expect, it } from 'vitest';

import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { bhViewportGetInfo } from '../../../../src/tools/viewport/bh-viewport-get-info';
import { bhViewportScroll } from '../../../../src/tools/viewport/bh-viewport-scroll';

describe('viewport tools', () => {
  it('returns a specific error for invalid viewport iframeId instead of throwing', async () => {
    const tool = bhViewportGetInfo(rpcClient(async () => {
      throw new Error('rpc should not be called');
    }));

    const result = await tool.execute(
      { target: 'iframe', iframeId: 'bad' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'ask' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.IFRAME_ID_INVALID,
      requiresObserve: false
    });
  });

  it('returns a specific error for invalid scroll iframeId instead of throwing', async () => {
    const tool = bhViewportScroll(rpcClient(async () => {
      throw new Error('rpc should not be called');
    }));

    const result = await tool.execute(
      { target: 'iframe', iframeId: 'bad', direction: 'down', amount: 'half' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'ask' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.IFRAME_ID_INVALID,
      requiresObserve: false
    });
  });

  it('passes parsed frameId to iframe viewport RPC requests', async () => {
    const tool = bhViewportGetInfo(rpcClient(async (message) => {
      expect(message).toMatchObject({
        type: CONTENT_RPC_MESSAGES.VIEWPORT_GET_INFO,
        frameId: 7
      });
      return {
        ok: true,
        viewport: {
          scrollX: 0,
          scrollY: 10,
          viewportWidth: 100,
          viewportHeight: 200,
          scrollWidth: 100,
          scrollHeight: 400,
          canScrollDown: true,
          canScrollUp: true,
          canScrollLeft: false,
          canScrollRight: false,
          atBottom: false,
          atTop: false
        }
      };
    }));

    const result = await tool.execute(
      { target: 'iframe', iframeId: 'frame_7' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'ask' }
    );

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK
    });
  });
});

function rpcClient(handler: ContentRpcClient['request']): ContentRpcClient {
  return { request: handler };
}
