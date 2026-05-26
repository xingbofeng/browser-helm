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

    const started = await manager.startRun({ task: '观察页面', mode: 'form' });
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
    )).toBe(true);
    expect(snapshot.messages?.some((message) =>
      message.role === 'agent' &&
      message.kind === 'page_summary' &&
      message.content.includes('欢迎注册 - 示例网站')
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
      })
    });

    const started = await manager.startRun({ task: '点击 iframe', mode: 'act' });
    await waitForSnapshot(manager, started.runId, 'observed');
    const result = await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.IFRAME_CLICK,
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
        tool: TOOL_NAMES.IFRAME_CLICK,
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUIRED,
        requiresApproval: true
      },
      pendingApproval: {
        tool: TOOL_NAMES.IFRAME_CLICK,
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
          payloadRecord(event.payload).tool === TOOL_NAMES.IFRAME_CLICK
      )
    ).toBe(false);
  });

  it('executes safe page observe tools through ToolRouter', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        expect(message.type).toBe(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
        return observationResponse();
      })
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
      })
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
            limitations: ['CDP deep inspection is not used in v1.0']
          }
        });
      })
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
      })
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
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_CLICK) {
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
          changedPage: message.type === CONTENT_RPC_MESSAGES.IFRAME_CLICK
        };
      })
    });

    const started = await manager.startRun({ task: '删除账号', mode: 'act' });
    await waitForSnapshot(manager, started.runId, 'observed');
    const approvalRequired = await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.IFRAME_CLICK,
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
        tool: TOOL_NAMES.IFRAME_CLICK,
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
      tool: TOOL_NAMES.IFRAME_TYPE,
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

  it('approves pending approval by recording the decision without executing the action', async () => {
    let clicked = false;
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse();
        }
        if (message.type === CONTENT_RPC_MESSAGES.IFRAME_CLICK) {
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
      tool: TOOL_NAMES.IFRAME_CLICK,
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
        tool: TOOL_NAMES.IFRAME_CLICK,
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
      tool: TOOL_NAMES.IFRAME_CLICK,
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
        return { text: '页面已经读取完成，可以继续检查表单。' };
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
          id: `${started.runId}:provider-response`,
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
      finalText: '页面已经读取完成，可以继续检查表单。'
    });
    expect(complete).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).not.toContain('sk-test-secret');
    expect(JSON.stringify(providerInput)).toContain('来源：example.com');
    expect(JSON.stringify(providerInput)).not.toContain('secret-token');
    expect(JSON.stringify(providerInput)).not.toContain('a@example.com');
    expect(JSON.stringify(providerInput)).not.toContain('/account/reset');
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
        return { text: '非流式回答' };
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
          id: `${started.runId}:provider-response`,
          status: 'complete',
          content: '非流式回答'
        })
      ])
    );
    expect(snapshot.streaming).toMatchObject({
      enabled: false,
      fallbackUsed: true,
      fallbackReason: 'streaming_disabled',
      finalText: '非流式回答'
    });
    expect(streamComplete).not.toHaveBeenCalled();
  });

  it('notifies subscribers after non-streaming provider messages are written', async () => {
    const providerClient: ModelClient = {
      async complete() {
        return { text: '非流式订阅回答' };
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
        message.id === `${started.runId}:provider-response` &&
        message.status === 'complete' &&
        message.content === '非流式订阅回答'
      ) === true
    );

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:provider-response`,
          status: 'complete',
          content: '非流式订阅回答'
        })
      ])
    );
  });

  it('falls back to complete when provider streaming fails', async () => {
    const complete = vi.fn(async () => ({ text: 'fallback 完成回答' }));
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
          id: `${started.runId}:provider-response`,
          status: 'complete',
          content: 'fallback 完成回答'
        })
      ])
    );
    expect(snapshot.streaming).toMatchObject({
      fallbackUsed: true,
      fallbackReason: 'stream_failed: stream broke [MASKED]',
      finalText: 'fallback 完成回答'
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
        return { text: '生成中完成' };
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
    expect(finishedSnapshot.status).toBe('observed');
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
    const snapshot = await waitForMessage(
      manager,
      started.runId,
      `${started.runId}:provider-config-guide`
    );

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:provider-config-guide`,
          kind: 'recommendation',
          title: '请配置模型',
          content: '请先在右上角模型配置中填写 Base URL、API Key 和 Model。'
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
        message.id === `${started.runId}:provider-config-guide`
      ) === true
    );

    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${started.runId}:provider-config-guide`,
          kind: 'recommendation'
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
      skipProviderResponse: true
    });
    const snapshot = await waitForSnapshot(manager, started.runId, 'observed');

    expect(createProviderModelClient).not.toHaveBeenCalled();
    expect(snapshot.trace?.some((event) =>
      event.type === TRACE_EVENT_NAMES.MODEL_STREAM_STARTED
    )).toBe(false);
    expect(snapshot.messages?.some((message) =>
      message.id === `${started.runId}:provider-response`
    )).toBe(false);
  });

  it('still calls the configured provider when async debug diagnostics fail', async () => {
    const providerClient: ModelClient = {
      async complete() {
        return { text: '页面诊断已完成，可以查看调试摘要。' };
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
          id: `${started.runId}:provider-response`,
          status: 'complete',
          content: '页面诊断已完成，可以查看调试摘要。'
        })
      ])
    );
    expect(snapshot.streaming).toMatchObject({
      fallbackUsed: true,
      fallbackReason: 'streaming_disabled',
      finalText: '页面诊断已完成，可以查看调试摘要。'
    });
    expect(JSON.stringify(snapshot)).not.toContain('sk-test-secret');
  });
});

function rpcClient(handler: ContentRpcClient['request']): ContentRpcClient {
  return {
    request: handler
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
        limitations: ['CDP deep inspection is not used in v1.0']
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

async function waitForMessage(
  manager: RunManager,
  runId: string,
  messageId: string
) {
  for (let index = 0; index < 30; index += 1) {
    const snapshot = manager.getSnapshot(runId);
    if (snapshot.messages?.some((message) => message.id === messageId)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return manager.getSnapshot(runId);
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
