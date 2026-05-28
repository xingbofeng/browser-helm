import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  message: z.string().min(1)
});

/**
 * 以最终摘要完成当前 Agent 运行。
 *
 * 这是内部 Agent 工具，用于 agent loop 完成任务后产出最终用户可见消息。它不读取或改变页面状态，风险等级为 safe，不触发 approval；返回 AGENT_FINISH 表示主循环可以收口。
 */
export const bhAgentFinish: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_finish',
  // 以最终摘要完成当前运行。
  title: 'Agent Finish',
  description: 'Completes current run with final summary',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  ui: {
    titleKey: 'tool.title.bh_agent_finish',
    descriptionKey: 'tool.description.bh_agent_finish',
  },
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
