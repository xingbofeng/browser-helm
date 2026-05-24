import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';

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
});
