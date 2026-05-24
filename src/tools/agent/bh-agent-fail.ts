import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  message: z.string().min(1),
  code: z.string().min(1).optional()
});

/**
 * Ends the current Agent run with a structured failure.
 *
 * Use this safe internal tool when the Agent has determined that the task
 * cannot continue or has failed. `message` becomes the run summary and `code`
 * can override the default failure code; the tool does not mutate the page,
 * never triggers approval, and returns a failed ToolResult.
 */
export const bhAgentFail: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_fail',
  // Agent 无法继续或确认失败时调用，作为一次 run 的失败终止信号。
  title: 'Agent Fail',
  description: 'Fails current run with structured error',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    return Promise.resolve({
      ok: false,
      code: args.code ?? ERROR_CODES.AGENT_FAIL,
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
