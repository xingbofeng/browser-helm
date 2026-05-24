import { describe, expect, it } from 'vitest';

import { bhA11yFindInteractive } from '../../../../src/tools/a11y/bh-a11y-find-interactive';
import { bhElementInspect } from '../../../../src/tools/element/bh-element-inspect';
import { bhElementReadState } from '../../../../src/tools/element/bh-element-read-state';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';

const interactiveRef = {
  refId: 'ref_button',
  role: 'button',
  name: '提交',
  tagName: 'button',
  visible: true,
  disabled: false,
  checked: false,
  selected: false,
  domOrder: 0,
  warnings: []
};

describe('v0.31 interactive read-only tools', () => {
  it('finds interactive elements from the current a11y snapshot in debug/form modes', async () => {
    const rpc = rpcClient(async (message) => {
      expect(message.type).toBe('BH_A11Y_SNAPSHOT');
      return {
        ok: true,
        snapshot: {
          url: 'https://demo.example.com',
          origin: 'https://demo.example.com',
          currentDomain: 'demo.example.com',
          elements: [interactiveRef],
          warnings: ['partial label warning']
        }
      };
    });
    const registry = new ToolRegistry();
    registry.register(bhA11yFindInteractive(rpc));
    const router = new ToolRouter(registry);

    expect(router.listToolContracts('debug').map((tool) => tool.name)).toContain(
      'bh_a11y_find_interactive'
    );
    expect(router.listToolContracts('form').map((tool) => tool.name)).toContain(
      'bh_a11y_find_interactive'
    );
    expect(router.listToolContracts('ask').map((tool) => tool.name)).not.toContain(
      'bh_a11y_find_interactive'
    );

    const result = await router.execute(
      { tool: 'bh_a11y_find_interactive', args: {} },
      { runId: 'run_1', stepId: 'step_1', runMode: 'debug' }
    );

    expect(result).toMatchObject({
      ok: true,
      code: 'OK',
      changedPage: false,
      requiresObserve: false
    });
    expect(result.data).toMatchObject({
      status: 'ready',
      count: 1,
      elements: [expect.objectContaining({ refId: 'ref_button' })],
      warnings: ['partial label warning']
    });
  });

  it('returns empty status when no interactive elements are available', async () => {
    const tool = bhA11yFindInteractive(
      rpcClient(async () => ({
        ok: true,
        snapshot: {
          elements: [],
          warnings: []
        }
      }))
    );

    const result = await tool.execute({}, { runId: 'run_1', stepId: 'step_1' });

    expect(result.data).toMatchObject({
      status: 'empty',
      count: 0,
      elements: []
    });
  });

  it('inspects and reads state for a valid ref', async () => {
    const rpc = rpcClient(async (message) => {
      expect(message).toMatchObject({
        type: 'BH_A11Y_RESOLVE_REF',
        refId: 'ref_button'
      });
      return {
        ok: true,
        ref: interactiveRef
      };
    });

    const inspect = await bhElementInspect(rpc).execute(
      { refId: 'ref_button' },
      { runId: 'run_1', stepId: 'step_1' }
    );
    const state = await bhElementReadState(rpc).execute(
      { refId: 'ref_button' },
      { runId: 'run_1', stepId: 'step_2' }
    );

    const inspectData = inspect.data as {
      element: { refId: string; name?: string };
      warnings: unknown[];
    };
    const stateData = state.data as {
      refId: string;
      visible: boolean;
      disabled: boolean;
      checked?: boolean;
      selected?: boolean;
      warnings: unknown[];
    };

    expect(inspectData.element.refId).toBe('ref_button');
    expect(inspectData.element.name).toBe('提交');
    expect(inspectData.warnings).toEqual([]);
    expect(stateData).toEqual({
      refId: 'ref_button',
      visible: true,
      disabled: false,
      checked: false,
      selected: false,
      warnings: []
    });
  });

  it('returns REF_STALE without guessing when a ref cannot be resolved', async () => {
    const stale = await bhElementInspect(
      rpcClient(async () => ({
        ok: false,
        code: 'REF_STALE',
        message: 'Ref is stale'
      }))
    ).execute({ refId: 'ref_old' }, { runId: 'run_1', stepId: 'step_1' });

    expect(stale).toMatchObject({
      ok: false,
      code: 'REF_STALE',
      changedPage: false,
      requiresObserve: true
    });
  });
});

function rpcClient(
  handler: ContentRpcClient['request']
): ContentRpcClient {
  return {
    request: handler
  };
}
