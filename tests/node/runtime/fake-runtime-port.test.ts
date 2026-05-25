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

  it('preserves v1 diagnosis fields on seeded snapshots', async () => {
    const port = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'seed_v1',
          mode: 'form',
          status: 'observed',
          refs: [],
          classification: {
            mode: 'form',
            taskType: 'form',
            confidence: 'high',
            reason: '用户要求诊断表单',
            matchedSignals: ['表单']
          },
          modeReason: 'form: 用户要求诊断表单',
          capabilities: {
            hasActiveTab: true,
            hasDebuggerPermission: false,
            hasClipboardPermission: false,
            hasDownloadsPermission: false,
            hostPermissions: ['http://127.0.0.1/*'],
            shallowDebugAvailable: true,
            cdp: 'reserved'
          },
          capabilityLimitations: [],
          goal: {
            goal: '诊断表单',
            successCriteria: ['列出表单字段状态'],
            satisfiedCriteria: [],
            unsatisfiedCriteria: ['列出表单字段状态']
          },
          plan: {
            id: 'plan_1',
            mode: 'form',
            updatedAt: 1,
            steps: [
              {
                id: 'read_fields',
                title: '读取表单字段',
                status: 'current'
              }
            ]
          },
          recovery: {
            action: {
              type: 're_observe',
              reason: 'REF_STALE'
            },
            attempts: 1,
            budgetRemaining: 0
          },
          findings: [
            {
              title: '必填字段为空',
              explanation: 'Email 为空',
              evidence: [
                {
                  source: 'form',
                  summary: 'Email required empty',
                  refId: 'ref_email'
                }
              ],
              confidence: 'high'
            }
          ],
          debugReport: {
            title: 'Form Doctor 诊断报告',
            findings: [],
            recommendations: [],
            limitations: ['浅层 debug 信号不可用']
          },
          canInterrupt: true,
          canReviseGoal: true
        }
      ]
    });

    const started = await port.startRun({ task: '诊断表单', mode: 'form' });
    const snapshot = await port.getRunSnapshot(started.runId);

    expect(snapshot.classification?.mode).toBe('form');
    expect(snapshot.capabilities?.hostPermissions).toContain('http://127.0.0.1/*');
    expect(snapshot.plan?.steps[0]?.title).toBe('读取表单字段');
    expect(snapshot.recovery?.action.type).toBe('re_observe');
    expect(snapshot.findings?.[0]?.confidence).toBe('high');
    expect(snapshot.debugReport?.title).toBe('Form Doctor 诊断报告');
    expect(snapshot.canInterrupt).toBe(true);
    expect(snapshot.canReviseGoal).toBe(true);
  });
});
