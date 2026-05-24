import { describe, expect, it } from 'vitest';

import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
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

function rpcClient(handler: ContentRpcClient['request']): ContentRpcClient {
  return {
    request: handler
  };
}
