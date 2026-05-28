import { z } from 'zod';

import { toolResultSchema } from '../../../src/shared/schemas/tool-result.schema';
import type { ToolSpec } from '../../../src/tools/core/tool-spec';

const argsSchema = z.object({
  page: z.string().min(1)
});

const findingSchema = z.object({
  severity: z.enum(['low', 'medium', 'high']),
  message: z.string(),
  selector: z.string().optional()
});

export const bhMockDebugErrors: ToolSpec<z.infer<typeof argsSchema>> = {
  name: 'bh_mock_debug_errors',
  title: 'Mock Debug Errors',
  description: 'Returns synthetic frontend debug findings for kernel tests',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    const findings = z
      .array(findingSchema)
      .parse([
        {
          severity: 'medium',
          message: `Mock debug finding on ${args.page}`,
          selector: '#submit-button'
        }
      ]);

    return Promise.resolve({
      ok: true,
      code: 'OK',
      summary: 'Collected mock debug findings',
      data: findings,
      nextHints: ['Cross-check with page observation'],
      context: {
        visibility: 'summary',
        summary: `debug-findings=${findings.length}`
      }
    });
  }
};
