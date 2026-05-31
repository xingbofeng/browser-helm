import { describe, expect, it } from 'vitest';

import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { bhActionClick } from '../../../../src/tools/action/bh-action-click';
import { bhActionCheckReadiness } from '../../../../src/tools/action/bh-action-check-readiness';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';

const buttonRef = {
  refId: 'ref_button',
  role: 'button',
  name: '删除账号',
  tagName: 'button',
  visible: true,
  disabled: false,
  warnings: []
};

describe('action readiness tool', () => {
  it('checks action readiness in debug and act modes without changing the page', async () => {
    const rpc = rpcClient(async (message) => {
      expect(message).toMatchObject({
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: 'ref_button'
      });
      return {
        ok: true,
        ref: buttonRef
      };
    });
    const registry = new ToolRegistry();
    registry.register(bhActionCheckReadiness(rpc));
    const router = new ToolRouter(registry);

    expect(router.listToolContracts('debug').map((tool) => tool.name)).toContain(
      TOOL_NAMES.ACTION_CHECK_READINESS
    );
    expect(router.listToolContracts('act').map((tool) => tool.name)).toContain(
      TOOL_NAMES.ACTION_CHECK_READINESS
    );
    expect(router.listToolContracts('ask').map((tool) => tool.name)).not.toContain(
      TOOL_NAMES.ACTION_CHECK_READINESS
    );

    const result = await router.execute(
      {
        tool: TOOL_NAMES.ACTION_CHECK_READINESS,
        args: {
          kind: 'click',
          refId: 'ref_button',
          source: 'agent'
        }
      },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: false,
      requiresObserve: false
    });
    expect(result.data).toMatchObject({
      canAct: true,
      risk: 'high',
      wouldRequireApproval: true
    });
  });

  it('returns requiresObserve when the target ref is stale', async () => {
    const tool = bhActionCheckReadiness(
      rpcClient(async () => ({
        ok: false,
        code: 'REF_STALE',
        message: 'Ref is stale'
      }))
    );

    const result = await tool.execute(
      {
        kind: 'click',
        refId: 'ref_old',
        source: 'agent'
      },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: false,
      requiresObserve: true
    });
    expect(result.data).toMatchObject({
      canAct: false,
      code: 'REF_STALE',
      staleRefs: true,
      requiresObserve: true
    });
  });
});

describe('action click tool', () => {
  it('clicks a ready top-frame target through authorized content RPC', async () => {
    const messages: unknown[] = [];
    const rpc = rpcClient(async (message) => {
      messages.push(message);
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
      throw new Error(`Unexpected message: ${message.type}`);
    });
    const registry = new ToolRegistry();
    registry.register(bhActionClick(rpc));
    const router = new ToolRouter(registry);

    expect(router.listToolContracts('act').map((tool) => tool.name)).toContain(
      TOOL_NAMES.ACTION_CLICK
    );
    expect(router.listToolContracts('debug').map((tool) => tool.name)).not.toContain(
      TOOL_NAMES.ACTION_CLICK
    );

    const result = await router.execute(
      {
        tool: TOOL_NAMES.ACTION_CLICK,
        args: {
          refId: 'ref_quickstart'
        }
      },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: true,
      requiresObserve: true
    });
    expect(messages).toEqual([
      {
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: 'ref_quickstart'
      },
      {
        type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
        frameId: 0,
        refId: 'ref_quickstart',
        action: 'click'
      },
      {
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 0,
        refId: 'ref_quickstart',
        actionToken: 'click-token'
      }
    ]);
  });

  it('routes iframe refs to the owning frame before clicking', async () => {
    const messages: unknown[] = [];
    const tool = bhActionClick(rpcClient(async (message) => {
      messages.push(message);
      if (message.type === CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF) {
        return {
          ok: true,
          ref: {
            refId: 'frame_7:ref_200',
            role: 'button',
            name: '展开详情',
            tagName: 'button',
            visible: true,
            disabled: false
          }
        };
      }
      if (message.type === CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE) {
        return { ok: true, actionToken: 'frame-token' };
      }
      if (message.type === CONTENT_RPC_MESSAGES.IFRAME_CLICK) {
        return { ok: true, ref: { refId: 'ref_200' }, changedPage: true };
      }
      throw new Error(`Unexpected message: ${message.type}`);
    }));

    const result = await tool.execute(
      { refId: 'frame_7:ref_200', source: 'agent' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        frameId: 7,
        refId: 'frame_7:ref_200'
      }
    });
    expect(messages.slice(1)).toEqual([
      {
        type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
        frameId: 7,
        refId: 'ref_200',
        action: 'click'
      },
      {
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 7,
        refId: 'ref_200',
        actionToken: 'frame-token'
      }
    ]);
  });

  it('blocks high-risk targets instead of clicking them', async () => {
    const messages: unknown[] = [];
    const tool = bhActionClick(rpcClient(async (message) => {
      messages.push(message);
      return {
        ok: true,
        ref: buttonRef
      };
    }));

    const result = await tool.execute(
      { refId: 'ref_button', source: 'agent' },
      { runId: 'run_1', stepId: 'step_1', runMode: 'act' }
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'APPROVAL_REQUIRED',
      changedPage: false,
      requiresObserve: false
    });
    expect(messages).toEqual([
      {
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: 'ref_button'
      }
    ]);
  });
});

function rpcClient(handler: ContentRpcClient['request']): ContentRpcClient {
  return {
    request: handler
  };
}
