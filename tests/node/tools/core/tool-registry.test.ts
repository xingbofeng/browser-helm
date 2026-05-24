import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ToolRegistry } from '../../../../src/tools/core/tool-registry';

describe('ToolRegistry', () => {
  it('registers and retrieves a tool by name', () => {
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
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: 'done'
      })
    });

    const tool = registry.get('bh_mock_page_observe');
    expect(tool?.name).toBe('bh_mock_page_observe');
  });
});
