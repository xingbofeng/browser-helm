import { describe, expect, it } from 'vitest';

import { BackgroundRuntimeHost } from '../../../src/background/runtime/background-runtime-host';
import { RUNTIME_MESSAGES } from '../../../src/shared/constants/event-names';

describe('BackgroundRuntimeHost approval runtime API', () => {
  it('routes execute tool and approval decisions through runtime messages', async () => {
    const calls: string[] = [];
    const host = new BackgroundRuntimeHost({
      startRun: async () => ({ runId: 'run_1' }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'act', status: 'observed' }),
      cancelRun: async () => ({ runId: 'run_1', status: 'cancelled' }),
      executeTool: async (input) => {
        calls.push(`${input.runId}:${input.tool}`);
        return {
          ok: false,
          code: 'APPROVAL_REQUIRED',
          summary: 'Requires approval',
          requiresApproval: true
        };
      },
      decideApproval: async (input) => {
        calls.push(`${input.runId}:${input.decision}`);
        return {
          ok: false,
          code: 'USER_DENIED_APPROVAL',
          summary: input.reason ?? 'User denied approval',
          changedPage: false,
          requiresObserve: false
        };
      },
      subscribeRun: () => () => undefined
    });

    await expect(
      host.handleMessage({
        type: RUNTIME_MESSAGES.EXECUTE_TOOL,
        input: {
          runId: 'run_1',
          tool: 'bh_iframe_click',
          args: {
            refId: 'frame_7:ref_201'
          }
        }
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        code: 'APPROVAL_REQUIRED'
      }
    });
    await expect(
      host.handleMessage({
        type: RUNTIME_MESSAGES.DECIDE_APPROVAL,
        input: {
          runId: 'run_1',
          requestId: 'apr_1',
          decision: 'denied',
          reason: '用户拒绝'
        }
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        code: 'USER_DENIED_APPROVAL'
      }
    });
    expect(calls).toEqual(['run_1:bh_iframe_click', 'run_1:denied']);
  });

  it('routes cancel run messages through the runtime boundary', async () => {
    const calls: string[] = [];
    const host = new BackgroundRuntimeHost({
      startRun: async () => ({ runId: 'run_1' }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'ask', status: 'cancelled' }),
      cancelRun: async (runId) => {
        calls.push(runId);
        return { runId, status: 'cancelled' };
      },
      executeTool: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      decideApproval: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      subscribeRun: () => () => undefined
    });

    await expect(
      host.handleMessage({
        type: RUNTIME_MESSAGES.CANCEL_RUN,
        runId: 'run_1'
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        runId: 'run_1',
        status: 'cancelled'
      }
    });
    expect(calls).toEqual(['run_1']);
  });

  it('subscribes to run events from the run manager', () => {
    const listeners: Array<(event: { runId: string; type: string }) => void> = [];
    const host = new BackgroundRuntimeHost({
      startRun: async () => ({ runId: 'run_1' }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'ask', status: 'observed' }),
      cancelRun: async () => ({ runId: 'run_1', status: 'cancelled' }),
      executeTool: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      decideApproval: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      subscribeRun: (_runId, listener) => {
        listeners.push(listener);
        return () => {
          listeners.pop();
        };
      }
    });
    const received: unknown[] = [];
    const unsubscribe = host.subscribeRun('run_1', (event) => {
      received.push(event);
    });

    listeners[0]?.({ runId: 'run_1', type: 'run_started' });
    unsubscribe();

    expect(received).toEqual([{ runId: 'run_1', type: 'run_started' }]);
    expect(listeners).toHaveLength(0);
  });
});
