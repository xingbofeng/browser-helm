import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import type { ToolSpec } from '../../../../src/tools/core/tool-spec';

describe('ToolRegistry', () => {
  type TestTool = ToolSpec<{ page: string }, { ok: boolean; code: string; summary: string }>;

  const makeTool = (name: string): TestTool => ({
    name,
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
    execute: async () => ({
      ok: true,
      code: 'OK',
      summary: 'done'
    })
  });

  it('registers and retrieves a tool by name', () => {
    const registry = new ToolRegistry();

    registry.register(makeTool('bh_mock_page_observe'));

    const tool = registry.get('bh_mock_page_observe');
    expect(tool?.name).toBe('bh_mock_page_observe');
  });

  it('throws when a duplicate tool name is registered', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('bh_mock_page_observe'));

    expect(() => registry.register(makeTool('bh_mock_page_observe'))).toThrow(
      'Duplicate tool registration: bh_mock_page_observe'
    );
  });
});
