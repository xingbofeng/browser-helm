import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  message: z.string().min(1)
});

export const bhAgentFinish: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_finish',
  // Agent 认为任务已经完成时调用，作为一次 run 的正常终止信号。
  title: 'Agent Finish',
  description: 'Completes current run with final summary',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    return Promise.resolve({
      ok: true,
      code: ERROR_CODES.AGENT_FINISH,
      summary: args.message,
      context: {
        visibility: 'summary',
        summary: args.message
      }
    });
  }
};
