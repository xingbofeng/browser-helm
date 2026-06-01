import { describe, expect, it, vi } from 'vitest';

import { RunManager } from '../../../src/background/runtime/run-manager';
import type { ModelClient } from '../../../src/agent/model/model-client';
import type { ContentRpcClient } from '../../../src/page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import {
  APPROVAL_EVENT_NAMES,
  CONTENT_RPC_MESSAGES,
  TRACE_EVENT_NAMES
} from '../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { AgentMessage } from '../../../src/shared/schemas/agent-message.schema';
import { defaultWorkflowRepo } from '../../../src/storage/workflow-repo';

describe('RunManager', () => {
  it('starts a run by observing the target tab through registered page tools', async () => {
    const calls: string[] = [];
    const rpc: ContentRpcClient = {
      async request(message) {
        calls.push(message.type);
        return {
          ok: true,
          observation: {
            url: 'http://127.0.0.1:3000/basic-form.html',
            title: '欢迎注册 - 示例网站',
            currentDomain: '127.0.0.1',
            origin: 'http://127.0.0.1:3000',
            visibleText: '创建账号 邮箱 密码',
            visibleTextSummary: '创建账号 邮箱 密码',
            pageStateSummary: '页面包含 2 个可交互元素',
            refSummary: [
              {
                refId: 'ref_101',
                role: 'button',
                name: '提交',
                tagName: 'button',
                visible: true,
                disabled: false
              }
            ],
            warnings: []
          }
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: (tabId) => {
        expect(tabId).toBe(42);
        return rpc;
      }
    });

    const started = await manager.startRun({ task: '观察页面', mode: 'form', runKind: 'observe_only' });
    const snapshot = await waitForSnapshot(manager, started.runId, 'observed');

    expect(snapshot).toMatchObject({
      runId: started.runId,
      status: 'observed',
      mode: 'form',
      observation: {
        title: '欢迎注册 - 示例网站',
        currentDomain: '127.0.0.1',
        interactiveCount: 1
      },
      refs: [
        {
          refId: 'ref_101',
          role: 'button',
          name: '提交'
        }
      ],
      structuredPageData: {
        refs: {
          status: 'ready',
          count: 1
        },
        interactive: {
          status: 'ready',
          count: 1
        },
        forms: {
          status: 'unsupported',
          count: 0
        }
      },
      toolResult: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: true,
        code: ERROR_CODES.OK
      }
    });
    expect(snapshot.trace?.slice(0, 3).map((event) => event.type)).toEqual([
      TRACE_EVENT_NAMES.RUN_STARTED,
      TRACE_EVENT_NAMES.TOOL_STARTED,
      TRACE_EVENT_NAMES.TOOL_RESULT
    ]);
    expect(calls).toContain(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
    expect(snapshot.trace?.slice(0, 3).every((event) => event.runId === started.runId)).toBe(true);
    expect(snapshot.messages?.some((message) =>
      message.role === 'user' && message.kind === 'task' && message.content === '观察页面'
    )).toBe(false);
    expect(payloadRecord(snapshot.trace?.[0]?.payload)).toMatchObject({
      task: '观察页面',
      mode: 'form'
    });
    expect(payloadRecord(snapshot.trace?.[1]?.payload)).toMatchObject({
      tool: TOOL_NAMES.PAGE_OBSERVE
    });
    expect(payloadRecord(snapshot.trace?.[2]?.payload)).toMatchObject({
      tool: TOOL_NAMES.PAGE_OBSERVE,
      code: ERROR_CODES.OK
    });
  });

  it('surfaces same-domain workflow hits as replay previews for user confirmation', async () => {
    const domain = `workflow-hit-${Date.now()}.example.com`;
    const workflow = defaultWorkflowRepo.save({
      domain,
      intent: '打开账单报表',
      taskDescription: '进入 Billing 后打开 Invoices',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: '观察账单页面',
        args: {},
        risk: 'safe',
        requiresApproval: false
      }]
    });
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse({
        url: `https://${domain}/dashboard`,
        title: 'Billing Dashboard',
        currentDomain: domain,
        origin: `https://${domain}`,
        visibleTextSummary: 'Billing Invoices'
      }))
    });

    const started = await manager.startRun({
      task: '打开账单报表',
      mode: 'ask',
      runKind: 'observe_only'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'observed');

    expect(snapshot.memory?.workflowPreviews?.[0]).toMatchObject({
      workflowId: workflow.id,
      intent: '打开账单报表',
      requiresApproval: true
    });

    defaultWorkflowRepo.delete(workflow.id);
  });

  it('attaches an unsaved workflow draft to successful runs without silently saving executable workflow memory', async () => {
    const domain = `workflow-draft-${Date.now()}.example.com`;
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse({
        url: `https://${domain}/billing`,
        title: 'Billing',
        currentDomain: domain,
        origin: `https://${domain}`,
        visibleTextSummary: 'Billing page ready'
      })),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel([{
        type: 'finish',
        message: '账单页面已经确认。'
      }])
    });

    const started = await manager.startRun({
      task: '确认账单页面',
      mode: 'ask'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(snapshot.workflowDraft).toMatchObject({
      domain,
      intent: '确认账单页面',
      requiresPreview: true,
      requiresApproval: true,
      saved: false
    });
    expect(defaultWorkflowRepo.lookup({ domain })).toEqual([]);
  });

  it('stores structured content unavailable errors from page tools', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => ({
        async request() {
          return {
            ok: false,
            code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
            message: 'Cannot access this page'
          };
        }
      })
    });

    const started = await manager.startRun({ task: '观察页面' });
    const snapshot = await waitForSnapshot(manager, started.runId, 'error');

    expect(snapshot).toMatchObject({
      status: 'error',
      mode: 'ask',
      error: {
        code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        message: 'Cannot access this page'
      },
      toolResult: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: false,
        code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE
      }
    });
    expect(snapshot.messages?.some((message) =>
      message.kind === 'error' &&
      message.status === 'error' &&
      message.content.includes('Cannot access this page')
    )).toBe(true);
  });

  it('blocks high-risk iframe tools before ToolRouter execution', async () => {
    const calls: string[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        calls.push(message.type);
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse();
        }
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_READ) {
          return {
            ok: true,
            ref: {
              refId: 'ref_200',
              role: 'button',
              name: '展开详情',
              tagName: 'button',
              visible: true,
              disabled: false
            }
          };
        }
        return {
          ok: true,
          ref: {
            refId: 'ref_200',
            role: 'button',
            name: '展开详情',
            tagName: 'button',
            visible: true,
            disabled: false
          },
          changedPage: true
        };
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel(formFillDecisions('ref_reply', '你真牛逼'))
    });

    const started = await manager.startRun({ task: '点击 iframe', mode: 'act' });
    await waitForSnapshot(manager, started.runId, 'observed');
    const result = await manager.executeTool({
      runId: started.runId,
      tool: 'bh_iframe_click',
      args: {
        refId: 'frame_7:ref_200'
      }
    });

    expect(calls).toEqual([CONTENT_RPC_MESSAGES.PAGE_OBSERVE]);
    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    expect(manager.getSnapshot(started.runId)).toMatchObject({
      status: 'waiting_for_approval',
      toolResult: {
        tool: 'bh_iframe_click',
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUIRED,
        requiresApproval: true
      },
      pendingApproval: {
        tool: 'bh_iframe_click',
        risk: 'high'
      }
    });
    const trace = manager.getSnapshot(started.runId).trace ?? [];
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED })
      ])
    );
    expect(
      trace.some(
        (event) =>
          event.type === TRACE_EVENT_NAMES.TOOL_STARTED &&
          payloadRecord(event.payload).tool === 'bh_iframe_click'
      )
    ).toBe(false);
  });

  it('executes safe page observe tools through ToolRouter', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        expect(message.type).toBe(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
        return observationResponse();
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel([
        {
          type: 'tool_call',
          tool: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
          args: {},
          reason: '收集页面健康摘要'
        },
        {
          type: 'finish',
          message: '诊断完成'
        }
      ])
    });

    const started = await manager.startRun({ task: '观察页面', mode: 'act' });
    await waitForSnapshot(manager, started.runId, 'observed');
    const result = await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.PAGE_OBSERVE,
      args: {}
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: false
    });
    expect(manager.getSnapshot(started.runId)).toMatchObject({
      status: 'observed',
      pendingApproval: undefined,
      toolResult: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: true,
        code: ERROR_CODES.OK
      }
    });
  });

  it('enriches real runtime snapshots with AgentLoop form diagnostics', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        expect(message.type).toBe(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
        return observationResponse();
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel(formFillDecisions('ref_reply', '你真牛逼'))
    });

    const started = await manager.startRun({ task: '诊断表单', mode: 'form' });
    const snapshot = await waitForSnapshot(manager, started.runId, 'observed');

    expect(snapshot).toMatchObject({
      classification: {
        mode: 'form'
      },
      plan: {
        mode: 'form'
      },
      debugReport: {
        title: 'Form Doctor 诊断报告'
      },
      canInterrupt: true,
      canReviseGoal: true
    });
    expect(snapshot.findings?.map((finding) => finding.title)).toContain(
      '必填字段为空'
    );
  });

  it('classifies debug mode from task when runtime start input omits explicit mode', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        expect(message.type).toBe(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
        return observationResponse({
          pageHealth: {
            consoleErrors: [
              {
                message: 'Uncaught TypeError',
                source: 'app.js',
                count: 1
              }
            ],
            networkFailures: [],
            hasForm: true,
            pageStateSummary: '检测到 1 类 console error 和 0 个 network failure',
            limitations: ['CDP deep inspection is not used']
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel(formFillDecisions('ref_reply', '你真牛逼'))
    });

    const started = await manager.startRun({ task: '检查这个页面有什么错误' });
    const snapshot = await waitForTraceEvent(
      manager,
      started.runId,
      TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED
    );

    expect(snapshot.mode).toBe('debug');
    expect(snapshot.classification?.mode).toBe('debug');
    expect(snapshot.findings?.map((finding) => finding.title)).toContain(
      'Console error'
    );
    expect(payloadRecord(snapshot.trace?.[0]?.payload)).toMatchObject({
      mode: 'debug'
    });
  });

  it('notifies subscribers when async AgentLoop diagnostics enrich the snapshot', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        expect(message.type).toBe(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
        return observationResponse();
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel([
        {
          type: 'tool_call',
          tool: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
          args: {},
          reason: '收集页面健康摘要'
        },
        {
          type: 'finish',
          message: '诊断完成'
        }
      ])
    });

    const started = await manager.startRun({ task: '检查页面错误', mode: 'debug' });
    const received: string[] = [];
    const unsubscribe = manager.subscribeRun(started.runId, (event) => {
      received.push(event.type);
    });
    const snapshot = await waitForTraceEvent(
      manager,
      started.runId,
      TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED
    );
    unsubscribe();

    expect(received).toContain(TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED);
    expect(snapshot.trace?.some(
      (event) =>
        event.type === TRACE_EVENT_NAMES.TOOL_STARTED &&
        payloadRecord(event.payload).tool === TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH
    )).toBe(true);
    expect(snapshot.debugReport?.title).toBe('Page Inspector 诊断报告');
    expect(snapshot.findings?.map((finding) => finding.title)).toContain(
      'Console error'
    );
  });

  it('creates approval request for high-risk iframe tools and deny returns USER_DENIED_APPROVAL', async () => {
    let clicked = false;
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse();
        }
        if ((message as { type: string }).type === 'BH_IFRAME_CLICK') {
          clicked = true;
        }
        return {
          ok: true,
          ref: {
            refId: 'ref_201',
            role: 'button',
            name: '删除账号',
            tagName: 'button',
            visible: true,
            disabled: false
          },
          changedPage: (message as { type: string }).type === 'BH_IFRAME_CLICK'
        };
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel(formFillDecisions('ref_reply', '你真牛逼'))
    });

    const started = await manager.startRun({ task: '删除账号', mode: 'act' });
    await waitForSnapshot(manager, started.runId, 'observed');
    const approvalRequired = await manager.executeTool({
      runId: started.runId,
      tool: 'bh_iframe_click',
      args: {
        refId: 'frame_7:ref_201'
      }
    });
    const pending = manager.getSnapshot(started.runId).pendingApproval;
    const denied = await manager.decideApproval({
      runId: started.runId,
      requestId: pending?.id ?? '',
      decision: 'denied',
      reason: '用户拒绝删除账号'
    });

    expect(approvalRequired).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    expect(manager.getSnapshot(started.runId)).toMatchObject({
      status: 'failed',
      toolResult: {
        tool: 'bh_iframe_click',
        ok: false,
        code: ERROR_CODES.USER_DENIED_APPROVAL,
        changedPage: false,
        requiresObserve: false
      }
    });
    expect(denied).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_DENIED_APPROVAL
    });
    expect(clicked).toBe(false);
    expect(manager.getSnapshot(started.runId).trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED }),
        expect.objectContaining({ type: APPROVAL_EVENT_NAMES.DENIED })
      ])
    );
  });

  it('redacts sensitive iframe type text from runtime approval requests', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse();
        }
        return {
          ok: true,
          ref: {
            refId: 'ref_202',
            role: 'textbox',
            name: '密码',
            tagName: 'input',
            visible: true,
            disabled: false
          }
        };
      })
    });

    const started = await manager.startRun({ task: '输入密码', mode: 'act' });
    await waitForSnapshot(manager, started.runId, 'observed');
    await manager.executeTool({
      runId: started.runId,
      tool: 'bh_iframe_type',
      args: {
        refId: 'frame_7:ref_202',
        text: 'super-secret',
        valuePreview: {
          masked: true,
          preview: '[MASKED]',
          reason: 'password'
        }
      }
    });

    const snapshot = manager.getSnapshot(started.runId);

    expect(JSON.stringify(snapshot)).not.toContain('super-secret');
    expect(snapshot.pendingApproval?.argsPreview).toMatchObject({
      refId: 'frame_7:ref_202',
      valuePreview: {
        masked: true,
        preview: '[MASKED]',
        reason: 'password'
      }
    });
  });

  it('redacts form fill values from runtime trace snapshots', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_FIELD) {
          return {
            ok: true,
            fillFieldResult: {
              fieldRefId: message.fieldRefId,
              type: 'text',
              status: 'filled',
              actualValuePreview: 'filled',
              maskedActualValue: 'filled'
            }
          };
        }
        return observationResponse();
      })
    });

    const started = await manager.startRun({ task: '填写表单', mode: 'form' });
    await waitForSnapshot(manager, started.runId, 'observed');
    await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: {
        fieldRefId: 'ref_name',
        value: 'private-value'
      }
    });
    const snapshot = manager.getSnapshot(started.runId);
    const trace = snapshot.trace ?? [];
    const fillResultEvent = trace.find(
      (event) => event.type === TRACE_EVENT_NAMES.FIELD_FILL_RESULT
    );
    const fillResultPayload = fillResultEvent?.payload as {
      fieldRefId?: string | undefined;
      maskedActualValue?: string | undefined;
    } | undefined;

    expect(JSON.stringify(trace)).not.toContain('private-value');
    expect(JSON.stringify(trace)).toContain('[MASKED]');
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TRACE_EVENT_NAMES.FIELD_FILL_STARTED }),
        expect.objectContaining({ type: TRACE_EVENT_NAMES.FIELD_FILL_RESULT })
      ])
    );
    expect(fillResultPayload).toMatchObject({
      fieldRefId: 'ref_name',
      maskedActualValue: '******'
    });
  });

  it('records form fill and verify lifecycle events for debug panel', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'text',
                status: 'filled',
                actualValuePreview: target.value,
                maskedActualValue: target.value
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse();
      })
    });

    const started = await manager.startRun({ task: '填写并验证表单', mode: 'form' });
    await waitForSnapshot(manager, started.runId, 'observed');
    await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: {
        fields: [
          { fieldRefId: 'ref_name', value: 'Counter User' },
          { fieldRefId: 'ref_email', value: 'counter@example.com' }
        ]
      }
    });
    await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.FORM_VERIFY,
      args: {
        fieldRefIds: ['ref_name', 'ref_email']
      }
    });
    const trace = manager.getSnapshot(started.runId).trace ?? [];
    const traceJson = JSON.stringify(trace);
    const verifyEvent = trace.find(
      (event) => event.type === TRACE_EVENT_NAMES.FORM_VERIFY_RESULT
    );
    const verifyPayload = verifyEvent?.payload as {
      status?: string | undefined;
      allValid?: boolean | undefined;
      submitAvailable?: boolean | undefined;
    } | undefined;

    expect(traceJson).not.toContain('Counter User');
    expect(traceJson).not.toContain('counter@example.com');
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TRACE_EVENT_NAMES.FIELD_FILL_STARTED }),
        expect.objectContaining({ type: TRACE_EVENT_NAMES.FIELD_FILL_RESULT }),
        expect.objectContaining({ type: TRACE_EVENT_NAMES.FORM_VERIFY_RESULT })
      ])
    );
    expect(verifyPayload).toMatchObject({
      status: 'pass',
      allValid: true,
      submitAvailable: true
    });
  });

  it('auto-fills reply text tasks in form mode', async () => {
    const fillManyCalls: unknown[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
          return {
            ok: true,
            actionToken: 'form-fill-token'
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'text',
                status: 'filled',
                actualValuePreview: target.value,
                maskedActualValue: target.value
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'X reply composer',
          currentDomain: 'x.com',
          visibleTextSummary: 'Reply Post',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_reply',
                label: '回复',
                name: 'reply',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: {
                  valid: true,
                  ariaInvalid: false
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel(formFillDecisions('ref_reply', '你真牛逼'))
    });

    const started = await manager.startRun({
      task: '帮我回复下“你真牛逼”',
      mode: 'form'
    });
    const trace = await waitForToolResult(manager, started.runId, TOOL_NAMES.FORM_VERIFY);

    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_STARTED, TOOL_NAMES.FORM_INFER_FILL_PLAN)).toBe(true);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY, true)).toBe(true);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_VERIFY, true)).toBe(true);
    expect(fillManyCalls).toEqual([
      [{ fieldRefId: 'ref_reply', value: '你真牛逼' }]
    ]);
  });

  it('auto-fills reply text tasks in act mode through the AgentLoop', async () => {
    const fillManyCalls: unknown[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
          return {
            ok: true,
            actionToken: 'form-fill-token'
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'text',
                status: 'filled',
                actualValuePreview: target.value,
                maskedActualValue: target.value
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'X reply composer',
          currentDomain: 'x.com',
          visibleTextSummary: 'Reply Post',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_reply',
                label: '回复',
                name: 'reply',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: {
                  valid: true,
                  ariaInvalid: false
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel(formFillDecisions('ref_reply', '你真牛逼'))
    });

    const started = await manager.startRun({
      task: '帮我回复下“你真牛逼”',
      mode: 'act'
    });
    const trace = await waitForToolResult(manager, started.runId, TOOL_NAMES.FORM_VERIFY);

    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_STARTED, TOOL_NAMES.FORM_INFER_FILL_PLAN)).toBe(true);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY, true)).toBe(true);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_VERIFY, true)).toBe(true);
    expect(manager.getSnapshot(started.runId).mode).toBe('act');
    expect(fillManyCalls).toEqual([
      [{ fieldRefId: 'ref_reply', value: '你真牛逼' }]
    ]);
  });

  it('auto-fills the GitHub dashboard ask textarea for Chinese type-into tasks', async () => {
    const fillManyCalls: unknown[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
          return {
            ok: true,
            actionToken: 'form-fill-token'
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'textarea',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'GitHub',
          currentDomain: 'github.com',
          visibleTextSummary: 'Home Ask anything',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_150',
                label: 'Find a repository…',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              },
              {
                refId: 'ref_166',
                label: 'Ask anything or type @ to add context',
                type: 'textarea',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel(formFillDecisions('ref_166', '这是什么'))
    });

    const started = await manager.startRun({
      task: '帮我给页面的home 下面那个输入框输入一个“这是什么”',
      mode: 'act'
    });
    await waitForToolResult(manager, started.runId, TOOL_NAMES.FORM_VERIFY);

    expect(fillManyCalls).toEqual([
      [{ fieldRefId: 'ref_166', value: '这是什么' }]
    ]);
  });

  it('fills Google search query tasks through AgentLoop tool calls in act mode', async () => {
    const fillManyCalls: unknown[] = [];
    const modelOutputs = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_INFER_FILL_PLAN,
        args: {
          userTask: '帮我搜索 “美国”',
          formSummary: '检测到 1 个字段',
          fields: [
            {
              refId: 'ref_q',
              label: '搜索',
              name: 'q',
              type: 'search',
              required: false,
              disabled: false,
              sensitive: false,
              valuePreview: 'empty'
            }
          ]
        },
        reason: '先读取表单填写计划'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_q', value: '美国' }]
        },
        reason: '用户明确提供了搜索词，美国 是任务原文子串'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_VERIFY,
        args: { fieldRefIds: ['ref_q'] },
        reason: '填写后必须验证'
      },
      {
        type: 'finish',
        message: '已在 Google 搜索框中填入“美国”，并完成验证。'
      }
    ];
    const providerClient: ModelClient = {
      async complete() {
        return {
          text: JSON.stringify(modelOutputs.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'search',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'Google',
          currentDomain: 'www.google.com',
          visibleTextSummary: 'Google Search',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_q',
                label: '搜索',
                name: 'q',
                type: 'search',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'planner-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索 “美国”',
      mode: 'act'
    });
    const trace = await waitForToolResult(manager, started.runId, TOOL_NAMES.FORM_VERIFY);

    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_STARTED, TOOL_NAMES.FORM_INFER_FILL_PLAN)).toBe(true);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY, true)).toBe(true);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_VERIFY, true)).toBe(true);
    expect(trace.some((event) => event.type === TRACE_EVENT_NAMES.MODEL_DECISION)).toBe(true);
    expect(JSON.stringify(trace)).not.toContain('form_fill_planner');
    expect(JSON.stringify(trace)).not.toContain('provider_plan_');
    expect(fillManyCalls).toEqual([
      [{ fieldRefId: 'ref_q', value: '美国' }]
    ]);
  });

  it('guides the model to verify or finish immediately after a successful form fill', async () => {
    const completeCalls: string[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_q', value: '最近的 agent 文章' }]
        },
        reason: '用户明确提供了搜索词'
      },
      {
        type: 'finish',
        message: '已在搜索框中填入“最近的 agent 文章”，尚未提交搜索。'
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: decisionText(decisions.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'search',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        return observationResponse({
          title: 'Search',
          currentDomain: 'example.com',
          visibleTextSummary: 'Search',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_q',
                label: '搜索',
                name: 'q',
                type: 'search',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索下“最近的 agent 文章”',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          content: '已在搜索框中填入“最近的 agent 文章”，尚未提交搜索。'
        })
      ])
    );
    expect(completeCalls[1]).toContain('decisionGuidance');
    expect(completeCalls[1]).toContain('bh_form_verify');
    expect(completeCalls[1]).toContain('finish');
    expect(completeCalls[1]).toContain('Do not call bh_form_fill_many again');
  });

  it('guides the model to finish immediately after successful form verification', async () => {
    const completeCalls: string[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_q', value: '最近的 agent 文章' }]
        },
        reason: '用户明确提供了搜索词'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_VERIFY,
        args: { fieldRefIds: ['ref_q'] },
        reason: '填写后验证'
      },
      {
        type: 'finish',
        message: '已在搜索框中填入“最近的 agent 文章”，并确认字段有效；尚未提交搜索。'
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: decisionText(decisions.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'search',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'Search',
          currentDomain: 'example.com',
          visibleTextSummary: 'Search',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_q',
                label: '搜索',
                name: 'q',
                type: 'search',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索下“最近的 agent 文章”',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          content: '已在搜索框中填入“最近的 agent 文章”，并确认字段有效；尚未提交搜索。'
        })
      ])
    );
    expect(completeCalls[2]).toContain('decisionGuidance');
    expect(completeCalls[2]).toContain('The last form verification completed');
    expect(completeCalls[2]).toContain('return finish now');
    expect(completeCalls[2]).toContain('Do not call bh_form_verify again');
  });

  it('does not expose internal terminal tools in model prompt tool contracts', async () => {
    let providerInput: Parameters<NonNullable<ModelClient['complete']>>[0] | undefined;
    const providerClient: ModelClient = {
      async complete(input) {
        providerInput = input;
        return {
          text: decisionText({
            type: 'finish',
            message: '页面已观察完成。'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '观察一下页面',
      mode: 'act'
    });
    await waitForSnapshot(manager, started.runId, 'finished');

    const promptText = providerInput?.messages.map((message) => message.content).join('\n') ?? '';
    expect(promptText).not.toContain(TOOL_NAMES.AGENT_FINISH);
    expect(promptText).not.toContain(TOOL_NAMES.AGENT_FAIL);
    expect(promptText).not.toContain(TOOL_NAMES.AGENT_ASK_USER);
    expect(promptText).toContain('"finish"');
    expect(promptText).toContain('"ask_user"');
    expect(promptText).toContain('"fail"');
  });

  it('treats non-empty plain text model output as finish after repair is exhausted', async () => {
    const complete = vi.fn(async () => ({
      text: '已完成页面观察。'
    }));
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: providerSettings(),
      createProviderModelClient: () => ({ complete })
    });

    const started = await manager.startRun({
      task: '观察一下页面',
      mode: 'ask'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(complete).toHaveBeenCalledTimes(2);
    expect(snapshot.error).toBeUndefined();
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          content: '已完成页面观察。'
        })
      ])
    );
  });

  it('repairs a repeated form fill after the previous fill already succeeded', async () => {
    const fillManyCalls: unknown[] = [];
    const completeCalls: string[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_q', value: '最近的 agent 文章' }]
        },
        reason: '填写搜索词'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_q', value: '最近的 agent 文章' }]
        },
        reason: '重复填写'
      },
      {
        type: 'finish',
        message: '已在搜索框中填入“最近的 agent 文章”，尚未提交搜索。'
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: decisionText(decisions.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'search',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        return observationResponse({
          title: 'Search',
          currentDomain: 'example.com',
          visibleTextSummary: 'Search',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_q',
                label: '搜索',
                name: 'q',
                type: 'search',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索下“最近的 agent 文章”',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(fillManyCalls).toHaveLength(1);
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          content: '已在搜索框中填入“最近的 agent 文章”，尚未提交搜索。'
        })
      ])
    );
    expect(completeCalls.some((prompt) =>
      prompt.includes('previous form fill already succeeded') &&
      prompt.includes('Do not call bh_form_fill_many again')
    )).toBe(true);
  });

  it('repairs a repeated form fill even when a read fields call happened in between', async () => {
    const fillManyCalls: unknown[] = [];
    const completeCalls: string[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [
            { fieldRefId: 'ref_last', value: '张' },
            { fieldRefId: 'ref_first', value: '三' }
          ]
        },
        reason: '填写姓名'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_READ_FIELDS,
        args: {},
        reason: '读取字段'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [
            { fieldRefId: 'ref_last', value: '张' },
            { fieldRefId: 'ref_first', value: '三' }
          ]
        },
        reason: '重复填写姓名'
      },
      {
        type: 'finish',
        message: '已把姓名填写为张三，未提交表单。'
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: decisionText(decisions.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: target.fieldRefId === 'ref_last' ? 'text' : 'text',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        return observationResponse({
          title: 'Create Account',
          currentDomain: 'account.apple.com',
          visibleTextSummary: 'Create account form',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_last',
                label: '姓氏',
                name: 'lastName',
                type: 'text',
                required: true,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              },
              {
                refId: 'ref_first',
                label: '名字',
                name: 'firstName',
                type: 'text',
                required: true,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '姓名填下张三，不要提交',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(fillManyCalls).toHaveLength(1);
    expect(hasTraceTool(snapshot.trace ?? [], TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_READ_FIELDS, true)).toBe(true);
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          content: '已把姓名填写为张三，未提交表单。'
        })
      ])
    );
    expect(completeCalls.some((prompt) =>
      prompt.includes('already succeeded earlier in this run') &&
      prompt.includes('finish')
    )).toBe(true);
  });

  it('carries model task state updates and runtime form facts into the next prompt', async () => {
    const completeCalls: string[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [
            { fieldRefId: 'ref_last', value: '张' },
            { fieldRefId: 'ref_first', value: '三' }
          ]
        },
        reason: '填写姓名',
        taskStateUpdate: {
          goal: '填写姓名为张三',
          completed: [],
          remaining: ['填写姓氏和名字'],
          recommendedNextDecision: 'tool_call',
          reason: '需要先执行填写动作'
        }
      },
      {
        type: 'finish',
        message: '已把姓名填写为张三，未提交表单。',
        taskStateUpdate: {
          completed: ['姓名已填写'],
          remaining: [],
          recommendedNextDecision: 'finish',
          reason: '用户没有要求提交'
        }
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: decisionText(decisions.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                label: target.fieldRefId === 'ref_last' ? '姓氏' : '名字',
                type: 'text',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        return observationResponse({
          title: 'Create Account',
          currentDomain: 'account.apple.com',
          visibleTextSummary: 'Create account form',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_last',
                label: '姓氏',
                name: 'lastName',
                type: 'text',
                required: true,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              },
              {
                refId: 'ref_first',
                label: '名字',
                name: 'firstName',
                type: 'text',
                required: true,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '姓名填下张三，不要提交',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(completeCalls[0]).toContain('taskState');
    expect(completeCalls[1]).toContain('"goal":"填写姓名为张三"');
    expect(completeCalls[1]).toContain('"filledFieldRefs":["ref_last","ref_first"]');
    expect(completeCalls[1]).toContain('"runtimeFactsOverrideModelNotes":true');
    expect(completeCalls[1]).toContain('"recommendedNextDecision":"finish"');
    expect(snapshot.taskState).toMatchObject({
      goal: '填写姓名为张三',
      remaining: [],
      recommendedNextDecision: 'finish'
    });
    expect(snapshot.taskState?.filledFieldRefs).toEqual(['ref_last', 'ref_first']);
  });

  it('blocks finish when explicit success criteria remain unverified', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse({
        title: 'Debug page',
        currentDomain: 'debug.example',
        visibleTextSummary: 'Console error: payment token missing'
      })),
      settingsStore: providerSettings(),
      createProviderModelClient: () => ({
        async complete() {
          return {
            text: decisionText({
              type: 'finish',
              message: '页面检查完成。',
              taskStateUpdate: {
                completed: ['已查看 console error'],
                remaining: []
              }
            })
          };
        }
      })
    });

    const started = await manager.startRun({
      task: '解释页面错误',
      mode: 'debug',
      goal: '解释页面错误',
      successCriteria: ['解释 console error 的根因']
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'waiting_for_user');

    expect(snapshot.status).toBe('waiting_for_user');
    expect(snapshot.messages?.some((message) =>
      message.content.includes('解释 console error 的根因')
    )).toBe(true);
    expect(snapshot.trace?.some((event) => event.type === TRACE_EVENT_NAMES.RUN_FINISHED)).toBe(false);
  });

  it('keeps mutating and diagnostic hook tools out of the prompt without domain consent', async () => {
    const completeCalls: string[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse({
        url: 'https://docs.example.com/form',
        currentDomain: 'docs.example.com',
        origin: 'https://docs.example.com'
      })),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {},
        async getDomainPolicy() {
          return undefined;
        }
      },
      createProviderModelClient: () => ({
        async complete(input) {
          completeCalls.push(input.messages.map((message) => message.content).join('\n'));
          return {
            text: decisionText({
              type: 'finish',
              message: '只读观察完成。'
            })
          };
        }
      })
    });

    const started = await manager.startRun({
      task: '帮我填写邮箱 user@example.com',
      mode: 'form'
    });
    await waitForSnapshot(manager, started.runId, 'finished');

    expect(completeCalls[0]).toContain(TOOL_NAMES.PAGE_OBSERVE);
    expect(completeCalls[0]).not.toContain(TOOL_NAMES.FORM_FILL_MANY);
    expect(completeCalls[0]).not.toContain(TOOL_NAMES.FORM_FILL_FIELD);
    expect(completeCalls[0]).not.toContain(TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH);
  });

  it('blocks direct mutating tool execution without domain consent', async () => {
    const rpcMessages: string[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        rpcMessages.push(message.type);
        return observationResponse({
          url: 'https://docs.example.com/form',
          currentDomain: 'docs.example.com',
          origin: 'https://docs.example.com'
        });
      }),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {},
        async getDomainPolicy() {
          return undefined;
        }
      }
    });

    const started = await manager.startRun({
      task: '观察表单',
      mode: 'form',
      runKind: 'observe_only'
    });
    await waitForSnapshot(manager, started.runId, 'observed');
    rpcMessages.length = 0;

    const result = await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: {
        fields: [{ fieldRefId: 'frame_7:ref_300', value: 'user@example.com' }]
      }
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'DOMAIN_NOT_ENABLED',
      changedPage: false
    });
    expect(rpcMessages).toEqual([]);
  });

  it('repairs a repeated form verify after the previous verification already succeeded', async () => {
    const verifyCalls: unknown[] = [];
    const completeCalls: string[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_q', value: '最近的 agent 文章' }]
        },
        reason: '填写搜索词'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_VERIFY,
        args: { fieldRefIds: ['ref_q'] },
        reason: '填写后验证'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_VERIFY,
        args: { fieldRefIds: ['ref_q'] },
        reason: '重复验证'
      },
      {
        type: 'finish',
        message: '已在搜索框中填入“最近的 agent 文章”，并确认字段有效；尚未提交搜索。'
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: decisionText(decisions.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'search',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          verifyCalls.push(message.fieldRefIds);
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'Search',
          currentDomain: 'example.com',
          visibleTextSummary: 'Search',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_q',
                label: '搜索',
                name: 'q',
                type: 'search',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索下“最近的 agent 文章”',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(verifyCalls).toHaveLength(1);
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          content: '已在搜索框中填入“最近的 agent 文章”，并确认字段有效；尚未提交搜索。'
        })
      ])
    );
    expect(completeCalls.some((prompt) =>
      prompt.includes('previous form verification already succeeded') &&
      prompt.includes('return finish')
    )).toBe(true);
  });

  it('repairs a form fill decision when the target field already has a value', async () => {
    const fillManyCalls: unknown[] = [];
    const completeCalls: string[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_109', value: 'agent 文章' }]
        },
        reason: '填写搜索词'
      },
      {
        type: 'finish',
        message: '搜索框里已经有内容，我没有覆盖已有输入。'
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: decisionText(decisions.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: [],
              filledCount: 0,
              skippedCount: 0,
              failedCount: 0,
              changedPage: false,
              requiresObserve: false,
              summary: 'not expected'
            }
          };
        }
        return observationResponse({
          title: 'Zhihu',
          currentDomain: 'www.zhihu.com',
          visibleTextSummary: '知乎 搜索',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_109',
                label: '搜索',
                name: 'q',
                type: 'search',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'non-empty',
                validation: { valid: true, ariaInvalid: false },
                writable: {
                  visible: true,
                  readonly: false,
                  hidden: false,
                  isFileUpload: false,
                  isContentEditable: false,
                  honeypotCandidate: false,
                  actualTagName: 'input'
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索下“最近的 agent 文章”',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(fillManyCalls).toEqual([]);
    expect(snapshot.error).toBeUndefined();
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          content: '搜索框里已经有内容，我没有覆盖已有输入。'
        })
      ])
    );
    expect(completeCalls).toHaveLength(2);
    expect(completeCalls[1]).toContain('already has a value');
    expect(completeCalls[1]).toMatch(/return finish/i);
  });

  it('does not execute tool calls returned during existing-value repair', async () => {
    const completeCalls: string[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_109', value: 'agent 文章' }]
        },
        reason: '填写搜索词'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_READ_FIELDS,
        args: {},
        reason: '错误地继续读取字段'
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: decisionText(decisions.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => {
        return observationResponse({
          title: 'Zhihu',
          currentDomain: 'www.zhihu.com',
          visibleTextSummary: '知乎 搜索',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_109',
                label: '搜索',
                name: 'q',
                type: 'search',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'non-empty',
                validation: { valid: true, ariaInvalid: false },
                writable: {
                  visible: true,
                  readonly: false,
                  hidden: false,
                  isFileUpload: false,
                  isContentEditable: false,
                  honeypotCandidate: false,
                  actualTagName: 'input'
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索下“最近的 agent 文章”',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(completeCalls).toHaveLength(2);
    expect(snapshot.error).toBeUndefined();
    expect(hasTraceTool(snapshot.trace ?? [], TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_READ_FIELDS)).toBe(false);
    const finalMessage = snapshot.messages?.find((message) =>
      message.id === `${started.runId}:agent-final`
    );
    expect(finalMessage?.content).toContain('已有值');
  });

  it('finishes gracefully when the model keeps trying to overwrite an existing value', async () => {
    const fillManyCalls: unknown[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_109', value: 'agent 文章' }]
        },
        reason: '填写搜索词'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_109', value: 'agent 文章' }]
        },
        reason: '继续尝试填写'
      }
    ];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
        }
        return observationResponse({
          title: 'Zhihu',
          currentDomain: 'www.zhihu.com',
          visibleTextSummary: '知乎 搜索',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_109',
                label: '搜索',
                name: 'q',
                type: 'search',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'non-empty',
                validation: { valid: true, ariaInvalid: false },
                writable: {
                  visible: true,
                  readonly: false,
                  hidden: false,
                  isFileUpload: false,
                  isContentEditable: false,
                  honeypotCandidate: false,
                  actualTagName: 'input'
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => decisionModel(decisions)
    });

    const started = await manager.startRun({
      task: '帮我搜索下“agent 文章”',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(fillManyCalls).toEqual([]);
    expect(snapshot.error).toBeUndefined();
    const finalMessage = snapshot.messages?.find((message) =>
      message.id === `${started.runId}:agent-final`
    );
    expect(finalMessage?.content).toContain('已有值');
  });

  it('allows explicit select option labels to map to DOM option values in AgentLoop', async () => {
    const fillManyCalls: unknown[] = [];
    const modelOutputs = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_country', value: 'USA' }]
        },
        reason: '用户明确要求选择 United States'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_VERIFY,
        args: { fieldRefIds: ['ref_country'] },
        reason: '填写后必须验证'
      },
      {
        type: 'finish',
        message: '已选择 United States。'
      }
    ];
    const providerClient: ModelClient = {
      async complete() {
        return {
          text: JSON.stringify(modelOutputs.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'select',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'Create Account',
          currentDomain: 'account.apple.com',
          visibleTextSummary: 'Create account form',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_country',
                label: '国家或地区',
                name: 'countrySelect',
                type: 'select',
                required: true,
                disabled: false,
                sensitive: false,
                valuePreview: 'non-empty',
                validation: { valid: true, ariaInvalid: false },
                writable: {
                  visible: true,
                  readonly: false,
                  hidden: false,
                  isFileUpload: false,
                  isContentEditable: false,
                  honeypotCandidate: false,
                  actualTagName: 'select',
                  actualValue: 'CHN',
                  selectedIndex: 0,
                  options: [
                    { value: 'CHN', label: '中国', selected: true },
                    { value: 'USA', label: '美国', selected: false }
                  ]
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'planner-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '国家或地区选择 United States，不要提交。',
      mode: 'act'
    });
    const trace = await waitForToolResult(manager, started.runId, TOOL_NAMES.FORM_VERIFY);

    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY, true)).toBe(true);
    expect(fillManyCalls).toEqual([
      [{ fieldRefId: 'ref_country', value: 'USA' }]
    ]);
  });

  it('allows explicit checkbox opt-out values for marketing fields in AgentLoop', async () => {
    const fillManyCalls: unknown[] = [];
    const modelOutputs = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_name', value: 'Counter' }]
        },
        reason: '用户明确要求填写姓名'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_VERIFY,
        args: { fieldRefIds: ['ref_updates'] },
        reason: '填写后必须验证'
      },
      {
        type: 'finish',
        message: '已取消营销勾选。'
      }
    ];
    const providerClient: ModelClient = {
      async complete() {
        return {
          text: JSON.stringify(modelOutputs.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: target.fieldRefId === 'ref_updates' ? 'checkbox' : 'text',
                status: 'filled',
                actualValuePreview: target.value === 'false' ? 'unchecked' : 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'Create Account',
          currentDomain: 'account.apple.com',
          visibleTextSummary: 'Create account form',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_name',
                label: '姓氏',
                name: 'lastName',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              },
              {
                refId: 'ref_updates',
                label: '通知 接收 Apple 电子邮件和营销内容',
                name: 'appleUpdates',
                type: 'checkbox',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'checked',
                validation: { valid: true, ariaInvalid: false },
                writable: {
                  visible: true,
                  readonly: false,
                  hidden: false,
                  isFileUpload: false,
                  isContentEditable: false,
                  honeypotCandidate: false,
                  actualTagName: 'input',
                  actualValue: 'true',
                  checked: true
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'planner-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: 'lastName 填 Counter，不要勾选营销，不接收 Apple 电子邮件，不要提交。',
      mode: 'act'
    });
    const trace = await waitForToolResult(manager, started.runId, TOOL_NAMES.FORM_VERIFY);

    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY, true)).toBe(true);
    expect(fillManyCalls).toEqual([
      [
        { fieldRefId: 'ref_name', value: 'Counter' },
        { fieldRefId: 'ref_updates', value: 'false' }
      ]
    ]);
  });

  it('repairs unavailable tool calls before they reach ToolRouter', async () => {
    const fillManyCalls: unknown[] = [];
    const decisions = [
      {
        type: 'tool_call',
        tool: 'bh_click',
        args: { refId: 'ref_search' },
        reason: '点击搜索框'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_search', value: '最近的 agent 文章' }]
        },
        reason: '用可用表单工具填写搜索词'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_VERIFY,
        args: { fieldRefIds: ['ref_search'] },
        reason: '填写后验证'
      },
      {
        type: 'finish',
        message: '已填写搜索词。'
      }
    ];
    const complete = vi.fn(async () => {
      return {
        text: JSON.stringify(decisions.shift() ?? {
          type: 'finish',
          message: 'done'
        })
      };
    });
    const providerClient: ModelClient = {
      complete
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'text',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: '知乎搜索',
          currentDomain: 'www.zhihu.com',
          visibleTextSummary: '搜索',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_search',
                label: '搜索',
                name: 'q',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索下“最近的 agent 文章”',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');
    const trace = snapshot.trace ?? [];

    expect(complete).toHaveBeenCalledTimes(4);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_STARTED, 'bh_click')).toBe(false);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, 'bh_click')).toBe(false);
    expect(hasTraceTool(trace, TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY, true)).toBe(true);
    expect(fillManyCalls).toEqual([
      [{ fieldRefId: 'ref_search', value: '最近的 agent 文章' }]
    ]);
  });

  it('repairs repeated action readiness checks for the same unchanged target', async () => {
    const decisions = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.ACTION_CHECK_READINESS,
        args: { kind: 'click', refId: 'ref_quickstart', source: 'agent' },
        reason: '检查 Quickstart 链接是否可点击'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.ACTION_CHECK_READINESS,
        args: { kind: 'click', refId: 'ref_quickstart', source: 'agent' },
        reason: '再次检查 Quickstart 链接'
      },
      {
        type: 'finish',
        message: 'Quickstart 链接已确认可点击，但动作就绪检查不会执行点击。'
      }
    ];
    const complete = vi.fn(async () => ({
      text: JSON.stringify(decisions.shift() ?? {
        type: 'finish',
        message: 'done'
      })
    }));
    const providerClient: ModelClient = { complete };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF) {
          return {
            ok: true,
            ref: {
              refId: 'ref_quickstart',
              role: 'link',
              name: 'Quickstart',
              tagName: 'a',
              visible: true,
              disabled: false
            }
          };
        }
        return observationResponse({
          title: 'OpenAI Docs',
          currentDomain: 'developers.openai.com',
          visibleTextSummary: 'Docs navigation Quickstart Guides API reference',
          pageStateSummary: '页面包含 Quickstart 导航链接',
          refSummary: [
            {
              refId: 'ref_quickstart',
              role: 'link',
              name: 'Quickstart',
              tagName: 'a',
              visible: true,
              disabled: false
            }
          ],
          formFields: {
            status: 'ready',
            fields: [],
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我搜索下这个文档的快速开始怎么搞',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');
    const trace = snapshot.trace ?? [];

    expect(complete).toHaveBeenCalledTimes(3);
    expect(trace.filter((event) =>
      event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
      payloadRecord(event.payload).tool === TOOL_NAMES.ACTION_CHECK_READINESS
    )).toHaveLength(1);
    expect(trace.some((event) =>
      event.type === TRACE_EVENT_NAMES.DECISION_PARSE_FAILED &&
      String(payloadRecord(payloadRecord(event.payload).parseError).message).includes('readiness')
    )).toBe(true);
    expect(snapshot.messages?.some((message) =>
      message.role === 'agent' &&
      message.status === 'complete' &&
      message.content.includes('不会执行点击')
    )).toBe(true);
  });

  it('orders tool status before ask_user replies from the same run', async () => {
    const providerClient: ModelClient = {
      complete: vi.fn()
        .mockResolvedValueOnce({
          text: JSON.stringify({
            type: 'tool_call',
            tool: TOOL_NAMES.ACTION_CHECK_READINESS,
            args: { kind: 'click', refId: 'ref_quickstart', source: 'agent' },
            reason: '检查 Quickstart 链接'
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            type: 'ask_user',
            question: '当前无法通过工具直接点击链接。是否愿意手动打开？'
          })
        })
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF) {
          return {
            ok: true,
            ref: {
              refId: 'ref_quickstart',
              role: 'link',
              name: 'Quickstart',
              tagName: 'a',
              visible: true,
              disabled: false
            }
          };
        }
        return observationResponse({
          title: 'OpenAI Docs',
          currentDomain: 'developers.openai.com',
          visibleTextSummary: 'Quickstart',
          pageStateSummary: '页面包含 Quickstart 导航链接',
          refSummary: [
            {
              refId: 'ref_quickstart',
              role: 'link',
              name: 'Quickstart',
              tagName: 'a',
              visible: true,
              disabled: false
            }
          ]
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '帮我点击', mode: 'act' });
    const snapshot = await waitForSnapshot(manager, started.runId, 'waiting_for_user');
    const messages = snapshot.messages ?? [];
    const toolIndex = messages.findIndex((message) =>
      message.id.includes(':tool-status:') &&
      message.content.includes('no action was executed')
    );
    const askIndex = messages.findIndex((message) => message.id.endsWith(':ask-user-required'));

    expect(toolIndex).toBeGreaterThan(-1);
    expect(askIndex).toBeGreaterThan(-1);
    expect(toolIndex).toBeLessThan(askIndex);
  });

  it('lets act-mode agents execute a normal click instead of stopping at readiness', async () => {
    const clickedMessages: unknown[] = [];
    const providerClient: ModelClient = {
      complete: vi.fn()
        .mockResolvedValueOnce({
          text: JSON.stringify({
            type: 'tool_call',
            tool: TOOL_NAMES.ACTION_CLICK,
            args: { refId: 'ref_quickstart' },
            reason: '点击 Quickstart 链接'
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            type: 'finish',
            message: '已点击 Quickstart。'
          })
        })
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF) {
          return {
            ok: true,
            ref: {
              refId: 'ref_quickstart',
              role: 'link',
              name: 'Quickstart',
              tagName: 'a',
              visible: true,
              disabled: false
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE) {
          return {
            ok: true,
            actionToken: 'click-token'
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_CLICK) {
          clickedMessages.push(message);
          return {
            ok: true,
            ref: {
              refId: 'ref_quickstart',
              role: 'link',
              name: 'Quickstart'
            },
            changedPage: true
          };
        }
        return observationResponse({
          title: 'OpenAI Docs',
          currentDomain: 'developers.openai.com',
          visibleTextSummary: 'Quickstart',
          pageStateSummary: '页面包含 Quickstart 导航链接',
          refSummary: [
            {
              refId: 'ref_quickstart',
              role: 'link',
              name: 'Quickstart',
              tagName: 'a',
              visible: true,
              disabled: false
            }
          ]
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '帮我点击 Quickstart', mode: 'act' });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(clickedMessages).toEqual([
      {
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 0,
        refId: 'ref_quickstart',
        actionToken: 'click-token'
      }
    ]);
    expect(hasTraceTool(snapshot.trace ?? [], TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.ACTION_CLICK, true)).toBe(true);
  });

  it('asks for explicit form values instead of rendering a run error when model invents values', async () => {
    const fillManyCalls: unknown[] = [];
    const providerClient: ModelClient = {
      async complete() {
        return {
          text: JSON.stringify({
            type: 'tool_call',
            tool: TOOL_NAMES.FORM_FILL_MANY,
            args: {
              fields: [{ fieldRefId: 'ref_email', value: 'user@example.com' }]
            },
            reason: '模型不能编造邮箱'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
        }
        return observationResponse({
          title: 'Signup',
          currentDomain: 'example.com',
          visibleTextSummary: 'Email',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_email',
                label: '邮箱',
                name: 'email',
                type: 'email',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'runtime-loop-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我填一下表单',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'waiting_for_user');

    expect(fillManyCalls).toEqual([]);
    expect(hasTraceTool(snapshot.trace ?? [], TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY)).toBe(false);
    expect(snapshot.error).toBeUndefined();
    const explicitValuesMessage = findRecommendation(snapshot.messages, /需要你提供具体字段值|Please provide specific field values/u);
    expect(explicitValuesMessage?.status).toBe('complete');
    expect(explicitValuesMessage?.content).toContain('邮箱');
  });

  it('asks for explicit values without repairing when arbitrary fill includes existing fields and checkbox booleans', async () => {
    const fillManyCalls: unknown[] = [];
    const completeCalls: string[] = [];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: JSON.stringify({
            type: 'tool_call',
            tool: TOOL_NAMES.FORM_FILL_MANY,
            args: {
              fields: [
                { fieldRefId: 'ref_email', value: 'user@example.com' },
                { fieldRefId: 'ref_password', value: 'Password123' },
                { fieldRefId: 'ref_updates', value: true }
              ]
            },
            reason: '模型不应根据随便填编造账户资料'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
        }
        return observationResponse({
          title: 'Apple Account',
          currentDomain: 'account.apple.com',
          visibleTextSummary: '创建 Apple 账户 邮箱 密码 更新',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_email',
                label: '电子邮件',
                name: 'email',
                type: 'email',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              },
              {
                refId: 'ref_password',
                label: '密码',
                name: 'password',
                type: 'password',
                required: false,
                disabled: false,
                sensitive: true,
                valuePreview: 'non-empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              },
              {
                refId: 'ref_updates',
                label: '接收 Apple 电子邮件',
                name: 'appleUpdates',
                type: 'checkbox',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'unchecked',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我填下表单，随便填，每个字段都模拟填下',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'waiting_for_user');

    expect(fillManyCalls).toEqual([]);
    expect(completeCalls).toHaveLength(1);
    expect(snapshot.error).toBeUndefined();
    expect(snapshot.trace?.some((event) => event.type === TRACE_EVENT_NAMES.DECISION_PARSE_FAILED)).toBe(false);
    const explicitValuesMessage = findRecommendation(snapshot.messages, /需要你提供具体字段值|Please provide specific field values/u);
    expect(explicitValuesMessage?.content).toContain('电子邮件');
  });

  it('answers ask tasks through AgentLoop terminal decisions instead of provider-only response messages', async () => {
    const providerClient: ModelClient = {
      async complete() {
        return {
          text: JSON.stringify({
            type: 'finish',
            message: '这是 AgentLoop 生成的页面总结。'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse({
        title: 'Example',
        currentDomain: 'example.com',
        visibleTextSummary: 'Example content'
      })),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'runtime-loop-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '总结这个页面',
      mode: 'ask'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'finished');

    expect(snapshot.trace?.some((event) => event.type === TRACE_EVENT_NAMES.MODEL_DECISION)).toBe(true);
    expect(snapshot.trace?.some((event) => event.type === TRACE_EVENT_NAMES.RUN_FINISHED)).toBe(true);
    expect(snapshot.messages?.some((message) => message.id === `${started.runId}:provider-response`)).toBe(false);
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          content: '这是 AgentLoop 生成的页面总结。'
        })
      ])
    );
  });

  it('uses AgentLoop tool calls to choose the field when form fill candidates are ambiguous', async () => {
    const fillManyCalls: unknown[] = [];
    const completeCalls: string[] = [];
    const modelOutputs = [
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_FILL_MANY,
        args: {
          fields: [{ fieldRefId: 'ref_166', value: '这是什么' }]
        },
        reason: '用户指定 Home 下方输入框，ref_166 的 textarea 更匹配'
      },
      {
        type: 'tool_call',
        tool: TOOL_NAMES.FORM_VERIFY,
        args: { fieldRefIds: ['ref_166'] },
        reason: '填写后验证'
      },
      {
        type: 'finish',
        message: '已填写并验证。'
      }
    ];
    const providerClient: ModelClient = {
      async complete(input) {
        completeCalls.push(input.messages.map((message) => message.content).join('\n'));
        return {
          text: JSON.stringify(modelOutputs.shift() ?? {
            type: 'finish',
            message: 'done'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
          return {
            ok: true,
            fillManyResult: {
              ok: true,
              fields: message.targets.map((target) => ({
                fieldRefId: target.fieldRefId,
                type: 'textarea',
                status: 'filled',
                actualValuePreview: 'non-empty',
                maskedActualValue: '[MASKED]'
              })),
              filledCount: message.targets.length,
              skippedCount: 0,
              failedCount: 0,
              changedPage: true,
              requiresObserve: false,
              summary: `填写成功 ${message.targets.length}/${message.targets.length} 个字段`
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        return observationResponse({
          title: 'GitHub',
          currentDomain: 'github.com',
          visibleTextSummary: 'Home Ask anything',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_150',
                label: 'Find a repository…',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              },
              {
                refId: 'ref_166',
                label: 'Ask anything or type @ to add context',
                type: 'textarea',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: { valid: true, ariaInvalid: false },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'planner-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我给页面的home 下面那个输入框输入一个“这是什么”',
      mode: 'act'
    });
    const trace = await waitForToolResult(manager, started.runId, TOOL_NAMES.FORM_VERIFY);

    expect(fillManyCalls).toEqual([
      [{ fieldRefId: 'ref_166', value: '这是什么' }]
    ]);
    expect(completeCalls.length).toBeGreaterThan(0);
    expect(trace.some((event) => event.type === TRACE_EVENT_NAMES.MODEL_DECISION)).toBe(true);
    expect(JSON.stringify(trace)).not.toContain('form_fill_planner');
    expect(JSON.stringify(trace)).not.toContain('sk-test-secret');
  });

  it('asks the user to switch to act instead of filling in ask mode', async () => {
    const fillManyCalls: unknown[] = [];
    const rpcCalls: string[] = [];
    let providerInput: Parameters<NonNullable<ModelClient['complete']>>[0] | undefined;
    const providerClient: ModelClient = {
      async complete(input) {
        providerInput = input;
        return {
          text: JSON.stringify({
            type: 'tool_call',
            tool: TOOL_NAMES.REQUEST_ACT_MODE,
            args: {
              reason: '用户请求在页面输入内容，Ask 模式只读'
            },
            reason: 'Ask 模式需要用户显式切换到 Act'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        rpcCalls.push(message.type);
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
        }
        return observationResponse({
          title: 'X reply composer',
          currentDomain: 'x.com',
          visibleTextSummary: 'Reply Post',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_reply',
                label: '回复',
                name: 'reply',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: {
                  valid: true,
                  ariaInvalid: false
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      }),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我在回复输入框输入“你真牛逼”',
      mode: 'ask'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'waiting_for_user');

    expect(fillManyCalls).toEqual([]);
    expect(rpcCalls).toEqual([CONTENT_RPC_MESSAGES.PAGE_OBSERVE]);
    expect(providerInput?.messages.some((message) =>
      message.content.includes(TOOL_NAMES.REQUEST_ACT_MODE)
    )).toBe(true);
    expect(hasTraceTool(manager.getSnapshot(started.runId).trace ?? [], TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY)).toBe(false);
    expect(snapshot.messages?.some((message) =>
      message.kind === 'recommendation' &&
      /需要执行模式|需要切换到执行模式|Act mode required/u.test(message.title ?? '') &&
      /切换到执行|执行 \/ Act|Act/u.test(message.content)
    )).toBe(true);
    expect(snapshot.trace?.some((event) =>
      event.type === TRACE_EVENT_NAMES.STATE_CHANGED &&
      payloadRecord(event.payload).reason === 'ask_mode_model_requested_act'
    )).toBe(true);
  });

  it('keeps ask-mode arbitrary form fill on the model ask_user path without schema errors', async () => {
    const providerClient: ModelClient = {
      async complete() {
        return {
          text: JSON.stringify({
            type: 'ask_user',
            message: '请提供每个字段要填写的具体值。'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse({
        title: 'Signup',
        currentDomain: 'example.com',
        visibleTextSummary: 'Email Name',
        formFields: {
          status: 'ready',
          fields: [
            {
              refId: 'ref_name',
              label: '姓名',
              name: 'name',
              type: 'text',
              required: false,
              disabled: false,
              sensitive: false,
              valuePreview: 'empty',
              validation: { valid: true, ariaInvalid: false },
              warnings: []
            }
          ],
          submit: {
            disabled: false,
            warnings: []
          },
          warnings: []
        }
      })),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'runtime-loop-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '帮我填下表单，随便填，每个字段都模拟填下',
      mode: 'ask'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'waiting_for_user');

    expect(snapshot.error).toBeUndefined();
    const askMessage = findRecommendation(snapshot.messages, /需要你的补充|Need your input/u);
    expect(askMessage?.content).toContain('请提供每个字段要填写的具体值。');
    expect(snapshot.trace?.some((event) =>
      event.type === TRACE_EVENT_NAMES.MODEL_DECISION &&
      payloadRecord(payloadRecord(event.payload).decision).type === 'ask_user'
    )).toBe(true);
    expect(snapshot.trace?.some((event) =>
      event.type === TRACE_EVENT_NAMES.DECISION_PARSE_FAILED &&
      payloadRecord(event.payload).code === ERROR_CODES.MODEL_OUTPUT_SCHEMA_INVALID
    )).toBe(false);
  });

  it('fails stuck model requests instead of leaving the run thinking forever', async () => {
    vi.useFakeTimers();
    try {
      const providerClient: ModelClient = {
        complete: () => new Promise(() => {})
      };
      const manager = new RunManager({
        getActiveTabId: async () => 42,
        createContentRpcClient: () => rpcClient(async () => observationResponse()),
        settingsStore: providerSettings(),
        createProviderModelClient: () => providerClient
      });

      const started = await manager.startRun({
        task: '总结页面',
        mode: 'ask'
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(manager.getSnapshot(started.runId).status).toBe('thinking');

      await vi.advanceTimersByTimeAsync(45_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(manager.getSnapshot(started.runId).status).toBe('thinking');

      await vi.advanceTimersByTimeAsync(555_000);
      await vi.advanceTimersByTimeAsync(0);

      const snapshot = manager.getSnapshot(started.runId);
      expect(snapshot.status).toBe('failed');
      expect(snapshot.error).toEqual({
        code: ERROR_CODES.MODEL_REQUEST_FAILED,
        message: '模型请求超时，请稍后重试。'
      });
      expect(snapshot.trace?.some((event) =>
        event.type === TRACE_EVENT_NAMES.MODEL_STREAM_FAILED &&
        String(payloadRecord(event.payload).summary).includes('timeout after 600000ms')
      )).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes legacy bh_ask_user decisions and shows a non-error user prompt', async () => {
    const providerClient: ModelClient = {
      async complete() {
        return {
          text: JSON.stringify({
            type: 'tool_call',
            tool: 'bh_ask_user',
            args: {
              message: '请提供姓氏、名字、出生日期、电子邮箱、密码、确认密码、电话号码。'
            }
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '你随便填就行',
      mode: 'act'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'waiting_for_user');

    expect(snapshot.error).toBeUndefined();
    expect(snapshot.messages?.some((message) =>
      message.kind === 'error' &&
      /运行出错|Run error/u.test(message.title ?? '')
    )).toBe(false);
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'recommendation',
          content: '请提供姓氏、名字、出生日期、电子邮箱、密码、确认密码、电话号码。'
        })
      ])
    );
    expect(snapshot.trace?.some((event) =>
      event.type === TRACE_EVENT_NAMES.DECISION_PARSE_FAILED &&
      JSON.stringify(event.payload).includes('bh_ask_user')
    )).toBe(false);
  });

  it('includes full chat conversation history in AgentLoop prompts', async () => {
    let providerInput: Parameters<NonNullable<ModelClient['complete']>>[0] | undefined;
    const providerClient: ModelClient = {
      async complete(input) {
        providerInput = input;
        return {
          text: decisionText({
            type: 'ask_user',
            question: '请提供要填写的具体值。'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({
      task: '你随便填就行',
      mode: 'act',
      conversationHistory: [
        { role: 'user', content: '帮我填 Apple 注册表单' },
        { role: 'agent', title: '需要你提供具体字段值', content: '请提供姓氏、名字和邮箱。' },
        { role: 'user', content: '姓氏：Counter；名字：Xing；邮箱：counter@example.com' }
      ]
    });
    await waitForSnapshot(manager, started.runId, 'waiting_for_user');

    const promptText = providerInput?.messages.map((message) => `${message.role}: ${message.content}`).join('\n') ?? '';
    expect(promptText).toContain('Conversation history before current request');
    expect(promptText).toContain('帮我填 Apple 注册表单');
    expect(promptText).toContain('请提供姓氏、名字和邮箱。');
    expect(promptText).toContain('姓氏：Counter；名字：Xing；邮箱：[REDACTED_EMAIL]');
    expect(promptText).toContain('你随便填就行');
  });

  it('bounds large previous trace history before sending provider prompts', async () => {
    let providerInput: Parameters<NonNullable<ModelClient['complete']>>[0] | undefined;
    const providerClient: ModelClient = {
      async complete(input) {
        providerInput = input;
        return {
          text: decisionText({
            type: 'finish',
            message: '已读取历史并完成。'
          })
        };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: providerSettings(),
      createProviderModelClient: () => providerClient
    });
    const noisyTrace = Array.from({ length: 120 }, (_, index) => ({
      runId: 'previous-run',
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      timestamp: index,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: true,
        summary: `trace-noise-${index}-${'x'.repeat(500)}`
      }
    }));

    const started = await manager.startRun({
      task: '继续刚才的任务',
      mode: 'act',
      conversationHistory: [
        { role: 'user', content: '帮我填 Apple 注册表单' },
        { role: 'agent', title: '需要你提供具体字段值', content: '请提供姓氏、名字和邮箱。' },
        { role: 'user', content: '最近回复：姓氏 Counter' },
        { role: 'system', title: 'Previous run trace', content: JSON.stringify(noisyTrace) }
      ]
    });
    await waitForSnapshot(manager, started.runId, 'finished');

    const promptText = providerInput?.messages.map((message) => `${message.role}: ${message.content}`).join('\n') ?? '';
    expect(JSON.stringify(providerInput?.messages ?? []).length).toBeLessThanOrEqual(32_000);
    expect(promptText).toContain('帮我填 Apple 注册表单');
    expect(promptText).toContain('最近回复：姓氏 Counter');
    expect(promptText).toContain('Previous run trace compacted');
    expect(promptText).toContain('trace-noise-119');
    expect(promptText).not.toContain('trace-noise-0');
    expect(promptText).not.toContain('x'.repeat(500));
  });

  it('does not auto-fill read-only tasks in act mode', async () => {
    const fillManyCalls: unknown[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
        }
        return observationResponse({
          title: 'Search page',
          currentDomain: 'example.com',
          visibleTextSummary: 'Search',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_search',
                label: '搜索',
                name: 'q',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: {
                  valid: true,
                  ariaInvalid: false
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      })
    });

    const started = await manager.startRun({
      task: '总结一下这个页面',
      mode: 'act'
    });
    await waitForSnapshot(manager, started.runId, 'observed');

    expect(fillManyCalls).toEqual([]);
    expect(hasTraceTool(manager.getSnapshot(started.runId).trace ?? [], TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY)).toBe(false);
  });

  it('does not auto-fill sensitive or non-empty fields in act mode', async () => {
    const fillManyCalls: unknown[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.FORM_FILL_MANY) {
          fillManyCalls.push(message.targets);
        }
        return observationResponse({
          title: 'Account settings',
          currentDomain: 'example.com',
          visibleTextSummary: 'Settings',
          formFields: {
            status: 'ready',
            fields: [
              {
                refId: 'ref_email',
                label: '邮箱',
                name: 'email',
                type: 'email',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: 'empty',
                validation: {
                  valid: true,
                  ariaInvalid: false
                },
                warnings: []
              },
              {
                refId: 'ref_reply_existing',
                label: '回复',
                name: 'reply',
                type: 'text',
                required: false,
                disabled: false,
                sensitive: false,
                valuePreview: '已有草稿',
                validation: {
                  valid: true,
                  ariaInvalid: false
                },
                warnings: []
              }
            ],
            submit: {
              disabled: false,
              warnings: []
            },
            warnings: []
          }
        });
      })
    });

    const started = await manager.startRun({
      task: '帮我回复下“收到”',
      mode: 'act'
    });
    await waitForSnapshot(manager, started.runId, 'observed');

    expect(fillManyCalls).toEqual([]);
    expect(hasTraceTool(manager.getSnapshot(started.runId).trace ?? [], TRACE_EVENT_NAMES.TOOL_RESULT, TOOL_NAMES.FORM_FILL_MANY)).toBe(false);
  });

  it('approves pending approval by recording the decision without executing the action', async () => {
    let clicked = false;
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse();
        }
        if ((message as { type: string }).type === 'BH_IFRAME_CLICK') {
          clicked = true;
        }
        return {
          ok: true,
          ref: {
            refId: 'ref_201',
            role: 'button',
            name: '删除账号',
            tagName: 'button',
            visible: true,
            disabled: false
          }
        };
      })
    });

    const started = await manager.startRun({ task: '删除账号', mode: 'act' });
    await waitForSnapshot(manager, started.runId, 'observed');
    await manager.executeTool({
      runId: started.runId,
      tool: 'bh_iframe_click',
      args: {
        refId: 'frame_7:ref_201'
      }
    });
    const pending = manager.getSnapshot(started.runId).pendingApproval;

    const approved = await manager.decideApproval({
      runId: started.runId,
      requestId: pending?.id ?? '',
      decision: 'approved'
    });

    expect(approved).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK
    });
    expect(approved.summary).toContain('no action was automatically executed');
    expect(manager.getSnapshot(started.runId)).toMatchObject({
      status: 'observed',
      pendingApproval: undefined,
      toolResult: {
        tool: 'bh_iframe_click',
        ok: true,
        code: ERROR_CODES.OK,
        changedPage: false,
        requiresObserve: false
      }
    });
    expect(manager.getSnapshot(started.runId).trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: APPROVAL_EVENT_NAMES.APPROVED })
      ])
    );
    expect(clicked).toBe(false);
  });

  it('executes approved form submit and observes the page again', async () => {
    const calls: string[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        calls.push(message.type);
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [{ fieldRefId: 'ref_email', valid: true, required: true, filled: true }],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT) {
          return {
            ok: true,
            submitResult: 'submitted'
          };
        }
        return observationResponse();
      })
    });

    const started = await manager.startRun({ task: '提交表单', mode: 'form' });
    await waitForSnapshot(manager, started.runId, 'observed');
    const approvalRequired = await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      args: {
        formName: '注册表单',
        submitMethod: 'button-click',
        submitTargetRefId: 'ref_submit',
        verifyStatus: 'pass',
        verifyFailed: false,
        fieldCount: 1,
        filledCount: 1,
        skippedCount: 0,
        riskExplanation: '将提交注册表单',
        fields: [
          {
            fieldRefId: 'ref_email',
            label: 'Email',
            type: 'email',
            valuePreview: 'user@example.com',
            isSensitive: false
          }
        ],
        warnings: []
      }
    });
    const pending = manager.getSnapshot(started.runId).pendingApproval;

    expect(approvalRequired).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    expect(calls).not.toContain(CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT);

    const approved = await manager.decideApproval({
      runId: started.runId,
      requestId: pending?.id ?? '',
      decision: 'approved'
    });
    const snapshot = manager.getSnapshot(started.runId);

    expect(approved).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: true,
      requiresObserve: false
    });
    expect(calls).toContain(CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT);
    expect(calls.filter((type) => type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE).length).toBeGreaterThanOrEqual(2);
    expect(snapshot.pendingApproval).toBeUndefined();
    expect(snapshot.toolResult).toMatchObject({
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      ok: true,
      code: ERROR_CODES.OK
    });
    expect(snapshot.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: APPROVAL_EVENT_NAMES.APPROVED }),
        expect.objectContaining({ type: TRACE_EVENT_NAMES.SUBMIT_APPROVAL_REQUESTED }),
        expect.objectContaining({ type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT })
      ])
    );
    expect(JSON.stringify(snapshot.trace)).not.toContain('user@example.com');
  });

  it('passes iframe formRefId through approved enter-submit without a submit button ref', async () => {
    const requests: Array<{ type: string; formRefId?: string; submitTargetRefId?: string; fieldRefIds?: string[] }> = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: (): ContentRpcClient => ({
        async request(message) {
        if (
          message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY ||
          message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE ||
          message.type === CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT
        ) {
          requests.push({
            type: message.type,
            ...('formRefId' in message && typeof message.formRefId === 'string' ? { formRefId: message.formRefId } : {}),
            ...('submitTargetRefId' in message && typeof message.submitTargetRefId === 'string' ? { submitTargetRefId: message.submitTargetRefId } : {}),
            ...('fieldRefIds' in message && Array.isArray(message.fieldRefIds) ? { fieldRefIds: message.fieldRefIds } : {})
          });
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [{ fieldRefId: 'frame_7:ref_email', valid: true, required: true, filled: true }],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
          return {
            ok: true,
            actionToken: 'submit-token'
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT) {
          return {
            ok: true,
            submitResult: 'submitted'
          };
        }
        return observationResponse();
        }
      })
    });

    const started = await manager.startRun({ task: '提交 iframe 表单', mode: 'form' });
    await waitForSnapshot(manager, started.runId, 'observed');
    await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      args: {
        formRefId: 'frame_7:form_1',
        formName: 'iframe 注册表单',
        submitMethod: 'enter-submit',
        verifyStatus: 'pass',
        verifyFailed: false,
        fieldCount: 1,
        filledCount: 1,
        skippedCount: 0,
        riskExplanation: '将通过 Enter 提交 iframe 表单',
        fields: [
          {
            fieldRefId: 'frame_7:ref_email',
            label: 'Email',
            type: 'email',
            valuePreview: 'non-empty',
            isSensitive: false
          }
        ],
        warnings: []
      }
    });
    const pending = manager.getSnapshot(started.runId).pendingApproval;

    await manager.decideApproval({
      runId: started.runId,
      requestId: pending?.id ?? '',
      decision: 'approved'
    });

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
          formRefId: 'frame_7:form_1',
          fieldRefIds: ['frame_7:ref_email']
        }),
        expect.objectContaining({
          type: CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT,
          formRefId: 'frame_7:form_1'
        })
      ])
    );
    expect(requests.find((request) => request.type === CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT)?.submitTargetRefId).toBeUndefined();
  });

  it('blocks an approved form submit when reverify says the submit target is not ready', async () => {
    const calls: string[] = [];
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        calls.push(message.type);
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'fail',
              allValid: false,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [{ fieldRefId: 'ref_email', valid: true, required: true, filled: true }],
              visibleErrorText: [],
              submitAvailable: false,
              disabledSubmitReason: { kind: 'confirmed', message: '提交按钮已禁用' },
              warnings: []
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT) {
          return {
            ok: true,
            submitResult: 'submitted'
          };
        }
        return observationResponse();
      })
    });

    const started = await manager.startRun({ task: '提交表单', mode: 'form' });
    await waitForSnapshot(manager, started.runId, 'observed');
    await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      args: {
        formName: '注册表单',
        submitMethod: 'button-click',
        submitTargetRefId: 'ref_submit',
        verifyStatus: 'pass',
        verifyFailed: false,
        fieldCount: 1,
        filledCount: 1,
        skippedCount: 0,
        riskExplanation: '将提交注册表单',
        fields: [
          {
            fieldRefId: 'ref_email',
            label: 'Email',
            type: 'email',
            valuePreview: 'non-empty',
            isSensitive: false
          }
        ],
        warnings: []
      }
    });
    const pending = manager.getSnapshot(started.runId).pendingApproval;

    const approved = await manager.decideApproval({
      runId: started.runId,
      requestId: pending?.id ?? '',
      decision: 'approved'
    });

    expect(approved).toMatchObject({
      ok: false,
      code: ERROR_CODES.SUBMIT_TARGET_NOT_READY
    });
    expect(calls).toContain(CONTENT_RPC_MESSAGES.FORM_VERIFY);
    expect(calls).not.toContain(CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT);
    expect(manager.getSnapshot(started.runId)).toMatchObject({
      status: 'error',
      pendingApproval: undefined,
      error: {
        code: ERROR_CODES.SUBMIT_TARGET_NOT_READY
      }
    });
  });

  it('cancels a run and prevents later tool execution', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse();
        }
        return {
          ok: true,
          ref: {
            refId: 'ref_200',
            role: 'button',
            name: '提交',
            tagName: 'button',
            visible: true,
            disabled: false
          },
          changedPage: true
        };
      })
    });

    const started = await manager.startRun({ task: '观察页面', mode: 'act' });
    const cancelled = await manager.cancelRun(started.runId);
    const result = await manager.executeTool({
      runId: started.runId,
      tool: 'bh_iframe_click',
      args: {
        refId: 'frame_7:ref_200'
      }
    });

    expect(cancelled).toEqual({
      runId: started.runId,
      status: 'cancelled'
    });
    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.RUN_CANCELLED
    });
    expect(manager.getSnapshot(started.runId)).toMatchObject({
      status: 'cancelled'
    });
    expect(manager.getSnapshot(started.runId).trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TRACE_EVENT_NAMES.RUN_CANCELLED })
      ])
    );
  });

  it('streams the configured provider response into recoverable agent messages', async () => {
    const complete = vi.fn();
    let providerInput: Parameters<NonNullable<ModelClient['streamComplete']>>[0] | undefined;
    const providerClient: ModelClient = {
      complete,
      async streamComplete(input, callbacks) {
        providerInput = input;
        callbacks?.onDelta?.('页面已经读取完成，');
        callbacks?.onDelta?.('可以继续检查表单。');
        return { text: decisionText({ type: 'finish', message: '页面已经读取完成，可以继续检查表单。' }) };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse({
        url: 'https://example.com/account/reset?token=secret-token&email=a@example.com#step2',
        currentDomain: 'example.com',
        origin: 'https://example.com'
      })),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: true
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '检查页面' });
    const snapshot = await waitForTraceEvent(
      manager,
      started.runId,
      TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED
    );

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          status: 'complete',
          content: '页面已经读取完成，可以继续检查表单。'
        })
      ])
    );
    expect(snapshot.streaming).toMatchObject({
      enabled: true,
      active: false,
      provider: 'api.example.com',
      model: 'demo-model',
      chunkCount: 2,
      fallbackUsed: false,
      finalText: decisionText({ type: 'finish', message: '页面已经读取完成，可以继续检查表单。' })
    });
    expect(complete).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).not.toContain('sk-test-secret');
    expect(JSON.stringify(providerInput)).toContain('example.com');
    expect(JSON.stringify(providerInput)).not.toContain('secret-token');
    expect(JSON.stringify(providerInput)).not.toContain('a@example.com');
    expect(snapshot.trace?.some((event) => event.type === 'model_prompt')).toBe(false);
  });

  it('reads article text before provider response when initial observation is truncated', async () => {
    const calls: string[] = [];
    let providerInput: Parameters<NonNullable<ModelClient['complete']>>[0] | undefined;
    const importantArticleText = '完整正文片段：agent evaluations use tasks, trials, graders, transcripts, outcomes, evaluation harnesses, and suites.';
    const providerClient: ModelClient = {
      async complete(input) {
        providerInput = input;
        if (!JSON.stringify(input).includes(importantArticleText)) {
          return {
            text: decisionText({
              type: 'tool_call',
              tool: TOOL_NAMES.PAGE_READ_ARTICLE,
              args: { maxChars: 12000 },
              reason: '初始观察被截断，需要读取正文'
            })
          };
        }
        return { text: decisionText({ type: 'finish', message: '长页面总结完成' }) };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        calls.push(message.type);
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse({
            title: 'Demystifying evals for AI agents',
            currentDomain: 'anthropic.com',
            visibleTextSummary: 'Introduction Good evaluations help teams ship AI agents more confidently...',
            warnings: ['VISIBLE_TEXT_TRUNCATED']
          });
        }
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_READ_ARTICLE) {
          return {
            ok: true,
            pageRead: {
              text: `${'导航噪声 '.repeat(40)}${importantArticleText}`,
              cursor: 0,
              hasMore: false,
              totalTextLength: 420,
              warnings: [],
              contentSource: 'article',
              headings: [
                { level: 1, text: 'Demystifying evals for AI agents' }
              ]
            }
          };
        }
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          message: 'unexpected rpc'
        };
      }),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '总结这篇文章' });
    const snapshot = await waitForTraceEvent(
      manager,
      started.runId,
      TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED
    );

    expect(calls).toContain(CONTENT_RPC_MESSAGES.PAGE_READ_ARTICLE);
    const readStarted = snapshot.trace?.find((event) =>
      event.type === TRACE_EVENT_NAMES.TOOL_STARTED &&
      payloadRecord(event.payload).tool === TOOL_NAMES.PAGE_READ_ARTICLE
    );
    const readFinished = snapshot.trace?.find((event) =>
      event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
      payloadRecord(event.payload).tool === TOOL_NAMES.PAGE_READ_ARTICLE
    );
    expect(readStarted).toBeTruthy();
    expect(payloadRecord(readFinished?.payload)).toMatchObject({
      tool: TOOL_NAMES.PAGE_READ_ARTICLE,
      ok: true
    });
    expect(JSON.stringify(providerInput)).toContain(importantArticleText);
  });

  it('keeps non-sensitive text fields in tool result detail while masking real secrets', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse())
    });

    const started = await manager.startRun({ task: '观察页面', mode: 'debug' });
    await waitForSnapshot(manager, started.runId, 'observed');
    const result = await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
      args: {}
    });
    const snapshot = manager.getSnapshot(started.runId);

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK
    });
    expect(JSON.stringify(snapshot.toolResult?.detail)).toContain('Uncaught TypeError');
  });

  it('respects disabled streaming by using provider complete fallback', async () => {
    const streamComplete = vi.fn();
    const providerClient: ModelClient = {
      async complete() {
        return { text: decisionText({ type: 'finish', message: '非流式回答' }) };
      },
      streamComplete
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '检查页面' });
    const snapshot = await waitForTraceEvent(
      manager,
      started.runId,
      TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED
    );

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          status: 'complete',
          content: '非流式回答'
        })
      ])
    );
    expect(snapshot.streaming).toMatchObject({
      enabled: false,
      fallbackUsed: true,
      fallbackReason: 'streaming_disabled',
      finalText: decisionText({ type: 'finish', message: '非流式回答' })
    });
    expect(streamComplete).not.toHaveBeenCalled();
  });

  it('notifies subscribers after non-streaming provider messages are written', async () => {
    const providerClient: ModelClient = {
      async complete() {
        return { text: decisionText({ type: 'finish', message: '非流式订阅回答' }) };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '检查页面' });
    const snapshot = await waitForSubscribedSnapshot(manager, started.runId, (nextSnapshot) =>
      nextSnapshot.messages?.some((message) =>
        message.id === `${started.runId}:agent-final` &&
        message.status === 'complete' &&
        message.content === '非流式订阅回答'
      ) === true
    );

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          status: 'complete',
          content: '非流式订阅回答'
        })
      ])
    );
  });

  it('falls back to complete when provider streaming fails', async () => {
    const complete = vi.fn(async () => ({ text: decisionText({ type: 'finish', message: 'fallback 完成回答' }) }));
    const providerClient: ModelClient = {
      complete,
      async streamComplete(_input, callbacks) {
        callbacks?.onDelta?.('部分');
        throw new Error('stream broke sk-test-secret');
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: true
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '检查页面' });
    const snapshot = await waitForTraceEvent(
      manager,
      started.runId,
      TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED
    );

    expect(complete).toHaveBeenCalledTimes(1);
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          status: 'complete',
          content: 'fallback 完成回答'
        })
      ])
    );
    expect(snapshot.streaming).toMatchObject({
      fallbackUsed: true,
      fallbackReason: 'stream_failed: stream broke [MASKED]',
      finalText: decisionText({ type: 'finish', message: 'fallback 完成回答' })
    });
    expect(JSON.stringify(snapshot)).not.toContain('sk-test-secret');
  });

  it('keeps run status thinking while provider streaming is active', async () => {
    let finishStream: (() => void) | undefined;
    const providerClient: ModelClient = {
      complete: vi.fn(),
      async streamComplete(_input, callbacks) {
        callbacks?.onDelta?.('生成中');
        await new Promise<void>((resolve) => {
          finishStream = resolve;
        });
        return { text: decisionText({ type: 'finish', message: '生成中完成' }) };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: true
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '检查页面' });
    const streamingSnapshot = await waitForSnapshot(manager, started.runId, 'thinking');

    expect(streamingSnapshot.streaming).toMatchObject({
      active: true
    });

    finishStream?.();
    const finishedSnapshot = await waitForTraceEvent(
      manager,
      started.runId,
      TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED
    );
    expect(finishedSnapshot.status).toBe('finished');
  });

  it('aborts the active provider stream when a run is cancelled', async () => {
    let providerSignal: AbortSignal | undefined;
    const providerClient: ModelClient = {
      complete: vi.fn(),
      async streamComplete(input) {
        providerSignal = input.signal;
        await new Promise<ModelClient>((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
        return { text: 'unreachable' };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: true
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '检查页面' });
    await waitForSnapshot(manager, started.runId, 'thinking');

    await manager.cancelRun(started.runId);

    expect(providerSignal?.aborted).toBe(true);
  });

  it('guides users to configure a model when provider settings are missing', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: {
        async getProviderSettings() {
          return undefined;
        },
        async setProviderSettings() {}
      }
    });

    const started = await manager.startRun({ task: '检查页面' });
    const snapshot = await waitForSnapshot(
      manager,
      started.runId,
      'waiting_for_user'
    );

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'error',
          title: '运行出错',
          content: 'Provider settings are required for the agent loop'
        })
      ])
    );
    expect(snapshot.streaming).toMatchObject({
      enabled: false,
      active: false
    });
  });

  it('notifies subscribers after provider configuration guidance is written', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: {
        async getProviderSettings() {
          return undefined;
        },
        async setProviderSettings() {}
      }
    });

    const started = await manager.startRun({ task: '检查页面' });
    const snapshot = await waitForSubscribedSnapshot(manager, started.runId, (nextSnapshot) =>
      nextSnapshot.messages?.some((message) =>
        message.kind === 'error' &&
        message.content === 'Provider settings are required for the agent loop'
      ) === true
    );

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'error',
          content: 'Provider settings are required for the agent loop'
        })
      ])
    );
  });

  it('skips provider responses for automatic page observation runs', async () => {
    const createProviderModelClient = vi.fn(() => ({
      async complete() {
        return { text: '不应该调用模型' };
      }
    }));
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async () => observationResponse()),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: true
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient
    });

    const started = await manager.startRun({
      task: '观察当前页面',
      mode: 'ask',
      runKind: 'observe_only'
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'observed');

    expect(createProviderModelClient).not.toHaveBeenCalled();
    expect(snapshot.trace?.some((event) =>
      event.type === TRACE_EVENT_NAMES.MODEL_STREAM_STARTED
    )).toBe(false);
    expect(snapshot.messages?.some((message) =>
      message.id === `${started.runId}:provider-response`
    )).toBe(false);
    expect(snapshot.messages?.some((message) =>
      message.id.endsWith(':observe-status') ||
      message.content.includes('BrowserHelm 已完成当前页面摘要和可交互结构读取。')
    )).toBe(false);
    expect(snapshot.messages?.some((message) =>
      message.kind === 'page_summary' &&
      message.title === '页面摘要'
    )).toBe(true);
  });

  it('still calls the configured provider when async debug diagnostics fail', async () => {
    const providerClient: ModelClient = {
      async complete() {
        return { text: decisionText({ type: 'finish', message: '页面诊断已完成，可以查看调试摘要。' }) };
      }
    };
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse();
        }
        throw new Error('content rpc unavailable');
      }),
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: 'https://api.example.com/v1',
            model: 'demo-model',
            apiKey: 'sk-test-secret',
            streamingEnabled: false
          };
        },
        async setProviderSettings() {}
      },
      createProviderModelClient: () => providerClient
    });

    const started = await manager.startRun({ task: '检查页面错误', mode: 'debug' });
    const snapshot = await waitForTraceEvent(
      manager,
      started.runId,
      TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED
    );

    expect(snapshot.debugReport?.title).toBe('Page Inspector 诊断报告');
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:agent-final`,
          status: 'complete',
          content: '页面诊断已完成，可以查看调试摘要。'
        })
      ])
    );
    expect(snapshot.streaming).toMatchObject({
      fallbackUsed: true,
      fallbackReason: 'streaming_disabled',
      finalText: decisionText({ type: 'finish', message: '页面诊断已完成，可以查看调试摘要。' })
    });
    expect(JSON.stringify(snapshot)).not.toContain('sk-test-secret');
  });
});

function rpcClient(handler: ContentRpcClient['request']): ContentRpcClient {
  return {
    async request(message) {
      if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
        return {
          ok: true,
          actionToken: 'test-form-action-token'
        };
      }
      return handler(message);
    }
  };
}

function observationResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    observation: {
      url: 'http://127.0.0.1:3000/iframe-form-host.html',
      title: 'Iframe 表单宿主 - 示例网站',
      currentDomain: '127.0.0.1',
      origin: 'http://127.0.0.1:3000',
      visibleText: 'iframe 表单 展开详情 删除账号',
      visibleTextSummary: 'iframe 表单 展开详情 删除账号',
      pageStateSummary: '页面包含 2 个可交互元素',
      pageHealth: {
        consoleErrors: [
          {
            message: 'Uncaught TypeError',
            source: 'app.js',
            count: 1
          }
        ],
        networkFailures: [],
        hasForm: true,
        pageStateSummary: '检测到 1 类 console error 和 0 个 network failure',
        limitations: ['CDP deep inspection is not used']
      },
      refSummary: [
        {
          refId: 'frame_7:ref_200',
          role: 'button',
          name: '展开详情',
          tagName: 'button',
          visible: true,
          disabled: false
        },
        {
          refId: 'frame_7:ref_201',
          role: 'button',
          name: '删除账号',
          tagName: 'button',
          visible: true,
          disabled: false
        }
      ],
      formFields: {
        status: 'ready',
        fields: [
          {
            refId: 'frame_7:ref_300',
            label: '邮箱',
            name: 'email',
            type: 'email',
            required: true,
            disabled: false,
            sensitive: false,
            valuePreview: 'empty',
            validation: {
              valid: false,
              message: '请填写邮箱',
              ariaInvalid: true
            },
            warnings: []
          }
        ],
        submit: {
          disabled: true,
          reason: {
            kind: 'inferred',
            message: '必填字段为空',
            fieldRefId: 'frame_7:ref_300'
          }
        },
        warnings: []
      },
      warnings: [],
      ...overrides
    }
  };
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};
}

function hasTraceTool(
  trace: NonNullable<ReturnType<RunManager['getSnapshot']>['trace']>,
  type: string,
  tool: string,
  ok?: boolean
) {
  return trace.some((event) => {
    if (event.type !== type) {
      return false;
    }
    const payload = payloadRecord(event.payload);
    if (payload.tool !== tool) {
      return false;
    }
    return ok === undefined || payload.ok === ok;
  });
}

function providerSettings() {
  return {
    async getProviderSettings() {
      return {
        baseUrl: 'https://api.example.com/v1',
        model: 'demo-model',
        apiKey: 'sk-test-secret',
        streamingEnabled: false
      };
    },
    async setProviderSettings() {}
  };
}

function decisionText(decision: Record<string, unknown>): string {
  return JSON.stringify(decision);
}

function decisionModel(decisions: Array<Record<string, unknown>>): ModelClient {
  return {
    async complete() {
      return {
        text: decisionText(decisions.shift() ?? {
          type: 'finish',
          message: 'done'
        })
      };
    }
  };
}

function formFillDecisions(fieldRefId: string, value: string): Array<Record<string, unknown>> {
  return [
    {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_INFER_FILL_PLAN,
      args: {
        userTask: value,
        formSummary: '检测到 1 个字段',
        fields: []
      },
      reason: '读取表单填写计划'
    },
    {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: {
        fields: [{ fieldRefId, value }]
      },
      reason: '用户任务中明确提供了该值'
    },
    {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_VERIFY,
      args: { fieldRefIds: [fieldRefId] },
      reason: '填写后验证'
    },
    {
      type: 'finish',
      message: '填写完成'
    }
  ];
}

async function waitForSnapshot(
  manager: RunManager,
  runId: string,
  status: ReturnType<RunManager['getSnapshot']>['status']
) {
  for (let index = 0; index < 20; index += 1) {
    const snapshot = manager.getSnapshot(runId);
    if (snapshot.status === status) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return manager.getSnapshot(runId);
}

async function waitForTraceEvent(
  manager: RunManager,
  runId: string,
  eventType: string
) {
  for (let index = 0; index < 30; index += 1) {
    const snapshot = manager.getSnapshot(runId);
    if (snapshot.trace?.some((event) => event.type === eventType)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return manager.getSnapshot(runId);
}

async function waitForToolResult(
  manager: RunManager,
  runId: string,
  tool: string
) {
  for (let index = 0; index < 30; index += 1) {
    const trace = manager.getSnapshot(runId).trace ?? [];
    if (trace.some((event) =>
      event.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
      payloadRecord(event.payload).tool === tool
    )) {
      return trace;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return manager.getSnapshot(runId).trace ?? [];
}

function waitForSubscribedSnapshot(
  manager: RunManager,
  runId: string,
  predicate: (snapshot: ReturnType<RunManager['getSnapshot']>) => boolean
) {
  return new Promise<ReturnType<RunManager['getSnapshot']>>((resolve, reject) => {
    const initialSnapshot = manager.getSnapshot(runId);
    if (predicate(initialSnapshot)) {
      resolve(initialSnapshot);
      return;
    }
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for subscribed snapshot'));
    }, 100);
    const unsubscribe = manager.subscribeRun(runId, () => {
      const snapshot = manager.getSnapshot(runId);
      if (!predicate(snapshot)) {
        return;
      }
      clearTimeout(timeout);
      unsubscribe();
      resolve(snapshot);
    });
  });
}

function findRecommendation(
  messages: AgentMessage[] | undefined,
  title: RegExp
): AgentMessage | undefined {
  return messages?.find((message) =>
    message.kind === 'recommendation' &&
    title.test(message.title ?? '')
  );
}
