import { z } from 'zod';

import { toolResultSchema } from '../../shared/schemas/toolResult.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  message: z.string().min(1)
});

export const bhAgentFinish: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_finish',
  title: 'Agent Finish',
  description: 'Completes current run with final summary',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    return Promise.resolve({
      ok: true,
      code: 'AGENT_FINISH',
      summary: args.message,
      context: {
        visibility: 'summary',
        summary: args.message
      }
    });
  }
};
