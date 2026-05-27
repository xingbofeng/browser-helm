import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  message: z.string().min(1)
});

/**
 * 以成功状态结束当前 Agent run，返回最终摘要。
 *
 * Agent 确认任务完成时调用此安全内部工具。`message` 参数是最终面向用户的汇总信息；
 * 该工具不修改页面状态，永不触发 approval，返回 `AGENT_FINISH` 结果供运行编排层
 * 作为终止信号处理。
 */
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
