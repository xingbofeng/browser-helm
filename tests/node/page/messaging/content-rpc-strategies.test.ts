import { describe, expect, it } from 'vitest';

import { createContentRpcStrategies } from '../../../../src/page/messaging/content-rpc-strategies';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';

describe('content-rpc-strategies', () => {
  it('targets the top frame when highlighting a non-iframe ref', async () => {
    const calls: Array<{ frameId: number | undefined; refId: string }> = [];
    const strategies = createContentRpcStrategies({
      frames: async () => [{ frameId: 0 }],
      sendFrameMessage: async (frameId, message) => {
        if (message.type !== CONTENT_RPC_MESSAGES.A11Y_HIGHLIGHT_REF) {
          throw new Error(`Unexpected message: ${message.type}`);
        }
        calls.push({ frameId, refId: message.refId });
        return {
          ok: true,
          ref: {
            refId: message.refId
          },
          changedPage: false
        };
      }
    });
    const strategy = strategies.find((candidate) =>
      candidate.type === CONTENT_RPC_MESSAGES.A11Y_HIGHLIGHT_REF
    );

    const result = await strategy?.execute({
      type: CONTENT_RPC_MESSAGES.A11Y_HIGHLIGHT_REF,
      refId: 'ref_101'
    });

    expect(result).toMatchObject({
      ok: true,
      ref: {
        refId: 'ref_101'
      }
    });
    expect(calls).toEqual([{ frameId: 0, refId: 'ref_101' }]);
  });
});
