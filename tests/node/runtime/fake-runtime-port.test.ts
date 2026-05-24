import { describe, expect, it } from 'vitest';

import { FakeRuntimePort } from '../../../src/runtime/fake-runtime-port';

describe('FakeRuntimePort', () => {
  it('starts runs, stores snapshots, emits events and cancels runs', async () => {
    const port = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'seed',
          mode: 'form',
          status: 'observed',
          refs: []
        }
      ]
    });
    const started = await port.startRun({ task: '观察页面', mode: 'form' });
    const events: string[] = [];
    const unsubscribe = port.subscribeRun(started.runId, (event) => {
      events.push(event.type);
    });

    await port.cancelRun(started.runId);
    unsubscribe();
    const snapshot = await port.getRunSnapshot(started.runId);

    expect(snapshot).toMatchObject({
      runId: started.runId,
      mode: 'form',
      status: 'cancelled'
    });
    expect(events).toContain('run_cancelled');
  });

  it('applies approval decisions and exposes provider settings', async () => {
    const port = new FakeRuntimePort({
      providerSettings: {
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: 'sk-secret'
      },
      snapshots: [
        {
          runId: 'run_approval',
          mode: 'act',
          status: 'waiting_for_approval',
          refs: [],
          pendingApproval: {
            id: 'apr_1',
            runId: 'run_approval',
            stepId: 'run_approval:bh_iframe_click',
            tool: 'bh_iframe_click',
            argsPreview: { refId: 'frame_1:ref_1' },
            risk: 'high',
            reason: 'Delete account',
            status: 'pending',
            createdAt: 1
          }
        }
      ]
    });

    await expect(
      port.decideApproval({
        runId: 'run_approval',
        requestId: 'apr_1',
        decision: 'denied',
        reason: '用户拒绝'
      })
    ).resolves.toMatchObject({
      ok: false,
      code: 'USER_DENIED_APPROVAL'
    });
    await expect(port.getProviderSettings()).resolves.toMatchObject({
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-test',
      apiKey: 'sk-secret'
    });
    await port.setProviderSettings({
      baseUrl: 'https://api.next.example.com/v1',
      model: 'gpt-next',
      apiKey: 'sk-next'
    });
    await expect(port.getProviderSettings()).resolves.toMatchObject({
      baseUrl: 'https://api.next.example.com/v1',
      model: 'gpt-next',
      apiKey: 'sk-next'
    });
  });
});
