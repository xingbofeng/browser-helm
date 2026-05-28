import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('ToolRouter', () => {
  it('returns TOOL_NOT_FOUND when tool is missing', async () => {
    const registry = new ToolRegistry();
    const router = new ToolRouter(registry);

    const result = await router.execute(
      {
        tool: 'unknown',
        args: {}
      },
      {
        runId: 'run_1',
        stepId: 'step_1'
      }
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('TOOL_NOT_FOUND');
  });

  it('executes registered tool and validates args schema', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_mock_page_observe',
      title: 'Observe Page',
      description: 'Collects page state',
      modes: ['internal'],
      risk: 'safe',
      argsSchema: z.object({
        page: z.string()
      }),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async ({ page }) => ({
        ok: true,
        code: 'OK',
        summary: `observed-${page}`
      })
    });

    const router = new ToolRouter(registry);
    const success = await router.execute(
      {
        tool: 'bh_mock_page_observe',
        args: {
          page: 'current'
        }
      },
      {
        runId: 'run_1',
        stepId: 'step_1'
      }
    );
    const invalid = await router.execute(
      {
        tool: 'bh_mock_page_observe',
        args: {
          page: 123
        }
      },
      {
        runId: 'run_1',
        stepId: 'step_2'
      }
    );

    expect(success.ok).toBe(true);
    expect(success.summary).toBe('observed-current');
    expect(invalid.ok).toBe(false);
    expect(invalid.code).toBe('TOOL_ARGS_INVALID');
  });

  it('exposes tool contracts for model prompts and trace metadata', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_mock_page_observe',
      title: 'Observe Page',
      description: 'Collects page state',
      modes: ['ask'],
      risk: 'low',
      argsSchema: z.object({
        page: z.string()
      }),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: 'observed'
      })
    });

    const router = new ToolRouter(registry);
    const contracts = router.listToolContracts();

    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({
      name: 'bh_mock_page_observe',
      title: 'Observe Page',
      modes: ['ask'],
      risk: 'low'
    });
    expect(JSON.stringify(contracts[0]?.argsSchema)).toContain('page');
  });

  it('filters prompt contracts by run mode while keeping internal tools visible', () => {
    const registry = new ToolRegistry();
    const makeTool = (
      name: string,
      modes: Array<'ask' | 'debug' | 'form' | 'act' | 'internal'>
    ) => ({
      name,
      title: name,
      description: name,
      modes,
      risk: 'safe' as const,
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: name
      })
    });
    registry.register(makeTool('bh_ask', ['ask']));
    registry.register(makeTool('bh_debug', ['debug']));
    registry.register(makeTool('bh_form', ['form']));
    registry.register(makeTool('bh_act', ['act']));
    registry.register(makeTool('bh_internal', ['internal']));

    const router = new ToolRouter(registry);

    expect(router.listToolContracts('ask').map((tool) => tool.name)).toEqual([
      'bh_ask',
      'bh_internal'
    ]);
    expect(router.listToolContracts('debug').map((tool) => tool.name)).toEqual([
      'bh_ask',
      'bh_debug',
      'bh_internal'
    ]);
    expect(router.listToolContracts('form').map((tool) => tool.name)).toEqual([
      'bh_ask',
      'bh_form',
      'bh_internal'
    ]);
    expect(router.listToolContracts('act').map((tool) => tool.name)).toEqual([
      'bh_form',
      'bh_act',
      'bh_internal'
    ]);
  });

  it('uses an explicit Act mode allow-list instead of exposing every ask tool', () => {
    const registry = new ToolRegistry();
    const makeTool = (
      name: string,
      modes: Array<'ask' | 'debug' | 'form' | 'act' | 'internal'>
    ) => ({
      name,
      title: name,
      description: name,
      modes,
      risk: 'safe' as const,
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: name
      })
    });
    registry.register(makeTool(TOOL_NAMES.PAGE_OBSERVE, ['ask', 'debug', 'form']));
    registry.register(makeTool('bh_future_ask_tool', ['ask']));

    const router = new ToolRouter(registry);

    expect(router.listToolContracts('act').map((tool) => tool.name)).toEqual([
      TOOL_NAMES.PAGE_OBSERVE
    ]);
  });

  it('blocks execution when tool is unavailable in the current run mode', async () => {
    const registry = new ToolRegistry();
    let executed = false;
    registry.register({
      name: 'bh_form_only',
      title: 'Form Only',
      description: 'Form tool',
      modes: ['form'],
      risk: 'safe',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => {
        executed = true;
        return {
          ok: true,
          code: 'OK',
          summary: 'ran'
        };
      }
    });

    const router = new ToolRouter(registry);
    const blocked = await router.execute(
      {
        tool: 'bh_form_only',
        args: {}
      },
      {
        runId: 'run_1',
        stepId: 'step_1',
        runMode: 'ask'
      }
    );

    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('TOOL_MODE_NOT_ALLOWED');
    expect(executed).toBe(false);
  });
});
