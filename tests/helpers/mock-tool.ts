import { z } from 'zod';

import type { ToolSpec } from '../../src/tools/core/tool-spec';
import { toolResultSchema } from '../../src/shared/schemas/tool-result.schema';

export function createMockTool(name: string): ToolSpec<{ input: string }> {
  return {
    name,
    title: `Mock tool: ${name}`,
    description: 'Generic mock tool for tests',
    modes: ['internal'],
    risk: 'safe',
    argsSchema: z.object({
      input: z.string()
    }),
    resultSchema: toolResultSchema,
    async execute(args) {
      return {
        ok: true,
        code: 'OK',
        summary: `processed-${args.input}`
      };
    }
  };
}
