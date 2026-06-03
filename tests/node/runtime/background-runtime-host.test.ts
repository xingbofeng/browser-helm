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
      reviseGoal: async (input) => {
        calls.push(`${input.runId}:revise`);
        return {
          runId: input.runId,
          mode: 'form',
          status: 'observed',
          goal: {
            goal: input.goal,
            successCriteria: input.successCriteria ?? [],
            satisfiedCriteria: [],
            unsatisfiedCriteria: input.successCriteria ?? []
          }
        };
      },
      executeTool: async (input) => {
        calls.push(`${input.runId}:${input.tool}`);
        return {
          ok: false,
          code: 'APPROVAL_REQUIRED',
          summary: 'Requires approval',
          requiresApproval: true
        };
      },
      highlightRef: async (input) => {
        calls.push(`${input.runId}:${input.refId}`);
        return {
          ok: true,
          code: 'OK',
          summary: 'highlighted'
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
      testProviderSettings: async () => ({
        ok: true,
        code: 'OK',
        message: '连接正常',
        supportsStreaming: true
      }),
      setDomainAdapterEnabled: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
      }),
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
    await expect(
      host.handleMessage({
        type: RUNTIME_MESSAGES.HIGHLIGHT_REF,
        input: {
          runId: 'run_1',
          refId: 'frame_7:ref_201'
        }
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        code: 'OK'
      }
    });
    expect(calls).toEqual([
      'run_1:bh_iframe_click',
      'run_1:denied',
      'run_1:frame_7:ref_201'
    ]);
  });

  it('strips caller-provided execution source and attests public tool calls as user sourced', async () => {
    const executeInputs: unknown[] = [];
    const host = new BackgroundRuntimeHost({
      startRun: async () => ({ runId: 'run_1' }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'act', status: 'observed' }),
      cancelRun: async () => ({ runId: 'run_1', status: 'cancelled' }),
      reviseGoal: async (input) => ({ runId: input.runId, mode: 'act', status: 'observed' }),
      executeTool: async (input) => {
        executeInputs.push(input);
        return { ok: true, code: 'OK', summary: 'ok' };
      },
      highlightRef: async () => ({ ok: true, code: 'OK', summary: 'highlighted' }),
      decideApproval: async () => ({ ok: true, code: 'OK', summary: 'ok' }),
      testProviderSettings: async () => ({
        ok: true,
        code: 'OK',
        message: '连接正常',
        supportsStreaming: true
      }),
      setDomainAdapterEnabled: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
      }),
      subscribeRun: () => () => undefined
    });

    await host.handleMessage({
      type: RUNTIME_MESSAGES.EXECUTE_TOOL,
      input: {
        runId: 'run_1',
        tool: 'bh_form_fill_many',
        args: { fields: [] },
        source: 'runtime'
      }
    }, {
      isExtensionPage: true,
      isContentScript: false
    });

    expect(executeInputs).toEqual([
      expect.objectContaining({
        runId: 'run_1',
        tool: 'bh_form_fill_many',
        source: 'user'
      })
    ]);
  });


  it('routes revise goal messages through the runtime boundary', async () => {
    const calls: string[] = [];
    const host = new BackgroundRuntimeHost({
      startRun: async () => ({ runId: 'run_1' }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'form', status: 'observed' }),
      cancelRun: async () => ({ runId: 'run_1', status: 'cancelled' }),
      reviseGoal: async (input) => {
        calls.push(input.goal);
        return {
          runId: input.runId,
          mode: 'form',
          status: 'observed',
          goal: {
            goal: input.goal,
            successCriteria: input.successCriteria ?? [],
            satisfiedCriteria: [],
            unsatisfiedCriteria: input.successCriteria ?? []
          }
        };
      },
      executeTool: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      highlightRef: async () => ({
        ok: true,
        code: 'OK',
        summary: 'highlighted'
      }),
      decideApproval: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      testProviderSettings: async () => ({
        ok: true,
        code: 'OK',
        message: '连接正常',
        supportsStreaming: true
      }),
      setDomainAdapterEnabled: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
      }),
      subscribeRun: () => () => undefined
    });

    await expect(
      host.handleMessage({
        type: RUNTIME_MESSAGES.REVISE_GOAL,
        input: {
          runId: 'run_1',
          goal: '只读诊断当前表单',
          successCriteria: ['解释 disabled submit 原因']
        }
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        goal: {
          goal: '只读诊断当前表单'
        }
      }
    });
    expect(calls).toEqual(['只读诊断当前表单']);
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
      reviseGoal: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
      }),
      executeTool: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      highlightRef: async () => ({
        ok: true,
        code: 'OK',
        summary: 'highlighted'
      }),
      decideApproval: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      testProviderSettings: async () => ({
        ok: true,
        code: 'OK',
        message: '连接正常',
        supportsStreaming: true
      }),
      setDomainAdapterEnabled: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
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
      reviseGoal: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
      }),
      executeTool: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      highlightRef: async () => ({
        ok: true,
        code: 'OK',
        summary: 'highlighted'
      }),
      decideApproval: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      testProviderSettings: async () => ({
        ok: true,
        code: 'OK',
        message: '连接正常',
        supportsStreaming: true
      }),
      setDomainAdapterEnabled: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
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

  it('routes provider test messages through the runtime boundary', async () => {
    const host = new BackgroundRuntimeHost({
      startRun: async () => ({ runId: 'run_1' }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'ask', status: 'observed' }),
      cancelRun: async () => ({ runId: 'run_1', status: 'cancelled' }),
      reviseGoal: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
      }),
      executeTool: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      highlightRef: async () => ({
        ok: true,
        code: 'OK',
        summary: 'highlighted'
      }),
      decideApproval: async () => ({
        ok: true,
        code: 'OK',
        summary: 'ok'
      }),
      testProviderSettings: async (settings) => ({
        ok: true,
        code: 'OK',
        message: `tested ${settings.model}`,
        supportsStreaming: settings.streamingEnabled
      }),
      setDomainAdapterEnabled: async (input) => ({
        runId: input.runId,
        mode: 'ask',
        status: 'observed'
      }),
      subscribeRun: () => () => undefined
    });

    await expect(
      host.handleMessage({
        type: RUNTIME_MESSAGES.TEST_PROVIDER_CONNECTION,
        input: {
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-4.1-mini',
          apiKey: 'sk-live-super-secret-token',
          streamingEnabled: true
        }
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        ok: true,
        message: 'tested gpt-4.1-mini',
        supportsStreaming: true
      }
    });
  });
});
