import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  question: z.string().min(1)
});

/**
 * 请求用户输入并暂停 Agent run。
 *
 * 仅在 Agent 缺少必要人工决策无法继续时调用此安全内部工具。`question` 参数是返回给
 * 用户的可见提示语；该工具不触碰页面状态，永不触发 approval，返回
 * `ASK_USER_REQUIRED` 结果供运行编排层处理。
 */
export const bhAgentAskUser: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_ask_user',
  // Agent 缺少必要用户决策时调用，用问题暂停当前 run。
  title: 'Agent Ask User',
  description: 'Requests user input before continuing',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    return Promise.resolve({
      ok: false,
      code: ERROR_CODES.ASK_USER_REQUIRED,
      summary: args.question,
      context: {
        visibility: 'summary',
        summary: args.question
      }
    });
  }
};
