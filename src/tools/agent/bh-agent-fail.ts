import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  message: z.string().min(1),
  code: z.string().min(1).optional()
});

/**
 * 以结构化失败状态结束当前 Agent run。
 *
 * Agent 确认任务无法继续或已失败时调用此安全内部工具。`message` 作为 run 摘要；
 * `code` 可覆写默认失败码。该工具不修改页面状态，永不触发 approval，返回失败
 * ToolResult。
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
