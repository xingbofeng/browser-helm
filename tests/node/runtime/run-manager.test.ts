import { describe, expect, it } from 'vitest';

import { RunManager } from '../../../src/background/runtime/run-manager';
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
});

function rpcClient(handler: ContentRpcClient['request']): ContentRpcClient {
  return {
    request: handler
  };
}

function observationResponse() {
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
      warnings: []
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
