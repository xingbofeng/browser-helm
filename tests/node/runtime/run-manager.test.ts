import { describe, expect, it } from 'vitest';

import { RunManager } from '../../../src/background/runtime/run-manager';
import type { ContentRpcClient } from '../../../src/page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES, TRACE_EVENT_NAMES } from '../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';

describe('RunManager', () => {
  it('starts a run by observing the target tab through registered page tools', async () => {
    const rpc: ContentRpcClient = {
      async request(message) {
        expect(message.type).toBe(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
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
    const snapshot = manager.getSnapshot(started.runId);

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

    expect(manager.getSnapshot(started.runId)).toMatchObject({
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

  it('executes iframe tools through ToolRouter in act mode and stores tool result contract', async () => {
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
    const result = await manager.executeTool({
      runId: started.runId,
      tool: TOOL_NAMES.IFRAME_CLICK,
      args: {
        refId: 'frame_7:ref_200'
      }
    });

    expect(calls).toEqual([
      CONTENT_RPC_MESSAGES.PAGE_OBSERVE,
      CONTENT_RPC_MESSAGES.IFRAME_READ,
      CONTENT_RPC_MESSAGES.IFRAME_CLICK
    ]);
    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: true,
      requiresObserve: true
    });
    expect(manager.getSnapshot(started.runId)).toMatchObject({
      status: 'observed',
      toolResult: {
        tool: TOOL_NAMES.IFRAME_CLICK,
        ok: true,
        code: ERROR_CODES.OK,
        changedPage: true,
        requiresObserve: true
      }
    });
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
        expect.objectContaining({ type: TRACE_EVENT_NAMES.STATE_CHANGED })
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

  it('approves pending approval and resumes the run without executing the action in v0.33', async () => {
    const manager = new RunManager({
      getActiveTabId: async () => 42,
      createContentRpcClient: () => rpcClient(async (message) => {
        if (message.type === CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
          return observationResponse();
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
      warnings: []
    }
  };
}
