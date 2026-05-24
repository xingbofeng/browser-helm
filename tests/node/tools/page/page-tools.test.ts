import { describe, expect, it } from 'vitest';

import { bhA11yRefreshRefs } from '../../../../src/tools/a11y/bh-a11y-refresh-refs';
import { bhA11yResolveRef } from '../../../../src/tools/a11y/bh-a11y-resolve-ref';
import { bhA11ySnapshot } from '../../../../src/tools/a11y/bh-a11y-snapshot';
import { bhPageObserve } from '../../../../src/tools/page/bh-page-observe';
import { bhFrameList } from '../../../../src/tools/page/bh-frame-list';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';

describe('real page tools', () => {
  it('routes bh_page_observe through ToolRouter and exposes summary context', async () => {
    const rpc: ContentRpcClient = {
      async request(message) {
        expect(message.type).toBe('BH_PAGE_OBSERVE');
        return {
          ok: true,
          observation: {
            url: 'https://demo.example.com/register',
            title: '欢迎注册 - 示例网站',
            currentDomain: 'demo.example.com',
            origin: 'https://demo.example.com',
            visibleText: '创建账号',
            visibleTextSummary: '创建账号',
            pageStateSummary: '页面包含 1 个可交互元素',
            refSummary: [],
            warnings: []
          }
        };
      }
    };
    const registry = new ToolRegistry();
    registry.register(bhPageObserve(rpc));
    const router = new ToolRouter(registry);

    const result = await router.execute(
      { tool: 'bh_page_observe', args: {} },
      { runId: 'run-1', stepId: 'step-1' }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: false,
      requiresObserve: false,
      context: {
        visibility: 'summary'
      }
    });
    expect(result.context?.summary).toContain('https://demo.example.com');
    const contextSummary = JSON.parse(result.context?.summary ?? '{}') as {
      counts?: { refs: number; interactive: number; forms: number };
      warnings?: string[];
    };
    expect(contextSummary.counts).toEqual({
      refs: 0,
      interactive: 0,
      forms: 0
    });
    expect(contextSummary.warnings).toContain('forms: unsupported');
  });

  it('returns content unavailable when content RPC cannot reach the page', async () => {
    const rpc: ContentRpcClient = {
      async request() {
        return {
          ok: false,
          code: 'CONTENT_SCRIPT_UNAVAILABLE',
          message: 'Cannot access this page'
        };
      }
    };

    const result = await bhPageObserve(rpc).execute(
      {},
      { runId: 'run-1', stepId: 'step-1' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'CONTENT_SCRIPT_UNAVAILABLE',
      requiresObserve: true
    });
  });

  it('lists page frames with urls for iframe debugging', async () => {
    const rpc: ContentRpcClient = {
      async request(message) {
        expect(message.type).toBe('BH_FRAME_LIST');
        return {
          ok: true,
          frames: [
            {
              frameId: 0,
              url: 'https://account.apple.com/account',
              isTop: true
            },
            {
              frameId: 7,
              url: 'https://appleid.apple.com/widget/account/',
              parentFrameId: 0,
              isTop: false
            }
          ]
        };
      }
    };

    const result = await bhFrameList(rpc).execute(
      {},
      { runId: 'run-1', stepId: 'step-1', runMode: 'debug' }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      summary: 'Detected 2 frames',
      changedPage: false,
      requiresObserve: false
    });
    expect(result.data).toEqual({
      frames: [
        {
          frameId: 0,
          url: 'https://account.apple.com/account',
          isTop: true
        },
        {
          frameId: 7,
          url: 'https://appleid.apple.com/widget/account/',
          parentFrameId: 0,
          isTop: false
        }
      ]
    });
  });

  it('registers a11y tools with safe risk and read-only names', () => {
    const rpc: ContentRpcClient = {
      async request() {
        return { ok: false, code: 'CONTENT_SCRIPT_UNAVAILABLE', message: 'no' };
      }
    };

    expect([
      bhA11ySnapshot(rpc).name,
      bhA11yResolveRef(rpc).name,
      bhA11yRefreshRefs(rpc).name
    ]).toEqual([
      'bh_a11y_snapshot',
      'bh_a11y_resolve_ref',
      'bh_a11y_refresh_refs'
    ]);
  });
});
