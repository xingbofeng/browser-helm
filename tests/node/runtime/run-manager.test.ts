import { describe, expect, it } from 'vitest';

import { RunManager } from '../../../src/background/runtime/run-manager';
import type { ContentRpcClient } from '../../../src/page/messaging/content-rpc-client';

describe('RunManager', () => {
  it('starts a run by observing the target tab through registered page tools', async () => {
    const rpc: ContentRpcClient = {
      async request(message) {
        expect(message.type).toBe('BH_PAGE_OBSERVE');
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

    const started = await manager.startRun({ task: '观察页面' });
    const snapshot = manager.getSnapshot(started.runId);

    expect(snapshot).toMatchObject({
      runId: started.runId,
      status: 'observed',
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
      toolResult: {
        tool: 'bh_page_observe',
        ok: true,
        code: 'OK'
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
            code: 'CONTENT_SCRIPT_UNAVAILABLE',
            message: 'Cannot access this page'
          };
        }
      })
    });

    const started = await manager.startRun({ task: '观察页面' });

    expect(manager.getSnapshot(started.runId)).toMatchObject({
      status: 'error',
      error: {
        code: 'CONTENT_SCRIPT_UNAVAILABLE',
        message: 'Cannot access this page'
      },
      toolResult: {
        tool: 'bh_page_observe',
        ok: false,
        code: 'CONTENT_SCRIPT_UNAVAILABLE'
      }
    });
  });
});
