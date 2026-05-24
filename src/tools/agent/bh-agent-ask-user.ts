import { z } from 'zod';

import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  question: z.string().min(1)
});

export const bhAgentAskUser: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_ask_user',
  title: 'Agent Ask User',
  description: 'Requests user input before continuing',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    return Promise.resolve({
      ok: false,
      code: 'ASK_USER_REQUIRED',
      summary: args.question,
      context: {
        visibility: 'summary',
        summary: args.question
      }
    });
  }
};
