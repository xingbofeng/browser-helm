import { z } from 'zod';

import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  message: z.string().min(1),
  code: z.string().min(1).optional()
});

export const bhAgentFail: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_fail',
  title: 'Agent Fail',
  description: 'Fails current run with structured error',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    return Promise.resolve({
      ok: false,
      code: args.code ?? 'AGENT_FAIL',
      summary: args.message,
      error: {
        message: args.message
      },
      context: {
        visibility: 'summary',
        summary: args.message
      }
    });
  }
};
