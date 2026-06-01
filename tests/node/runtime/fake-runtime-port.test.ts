import { beforeEach, describe, expect, it } from 'vitest';

import { defaultDomainAdapterPreferences } from '../../../src/adapters/preferences';
import { FakeRuntimePort } from '../../../src/runtime/fake-runtime-port';

describe('FakeRuntimePort', () => {
  beforeEach(() => {
    defaultDomainAdapterPreferences.clear();
  });

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
    expect(snapshot.messages?.some((message) =>
      message.kind === 'task' && message.content === '观察页面'
    )).toBe(true);
    expect(snapshot.messages?.some((message) =>
      message.kind === 'error' && message.content.includes('已取消')
    )).toBe(true);
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

  it('preserves diagnosis fields on seeded snapshots', async () => {
    const port = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'seed_diag',
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

  it('revises an existing run goal and emits a plan update event', async () => {
    const port = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'seed_goal',
          mode: 'form',
          status: 'observed',
          refs: []
        }
      ]
    });
    const started = await port.startRun({ task: '诊断表单', mode: 'form' });
    const events: string[] = [];
    port.subscribeRun(started.runId, (event) => {
      events.push(event.type);
    });

    const snapshot = await port.reviseGoal({
      runId: started.runId,
      goal: '只读诊断当前表单',
      successCriteria: ['解释 disabled submit 原因']
    });

    expect(snapshot.goal).toMatchObject({
      goal: '只读诊断当前表单',
      successCriteria: ['解释 disabled submit 原因'],
      unsatisfiedCriteria: ['解释 disabled submit 原因']
    });
    expect(snapshot.plan?.mode).toBe('form');
    expect(events).toContain('plan_updated');
  });

  it('updates domain adapter snapshots when toggling adapter preferences', async () => {
    const port = new FakeRuntimePort({
      snapshots: [
        {
          runId: 'seed_adapter',
          mode: 'ask',
          status: 'observed',
          refs: [],
          observation: {
            url: 'https://github.com/openai/browser-helm/issues',
            title: 'Issues',
            currentDomain: 'github.com',
            origin: 'https://github.com',
            visibleTextSummary: 'Issues',
            pageStateSummary: 'GitHub issues page',
            interactiveCount: 1,
            warnings: []
          },
          domainAdapter: {
            enabled: true,
            id: 'github',
            label: 'GitHub adapter',
            workflowCount: 1,
            locatorCount: 1,
            approvalEnforced: true
          }
        }
      ]
    });

    const disabled = await port.setDomainAdapterEnabled({
      runId: 'seed_adapter',
      adapterId: 'github',
      enabled: false
    });
    expect(disabled.domainAdapter).toMatchObject({
      enabled: false,
      disabledAdapter: {
        id: 'github'
      }
    });

    const enabled = await port.setDomainAdapterEnabled({
      runId: 'seed_adapter',
      adapterId: 'github',
      enabled: true
    });
    expect(enabled.domainAdapter).toMatchObject({
      enabled: true,
      id: 'github',
      label: 'GitHub'
    });
  });
});
