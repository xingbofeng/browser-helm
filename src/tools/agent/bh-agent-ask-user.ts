import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

import { toolMeta } from '../core/tool-meta';

const argsSchema = z.object({
  question: z.string().min(1)
});

/**
 * 请求用户补充输入。
 *
 * 这是内部 Agent 工具，只在主 agent loop 需要用户澄清或提供缺失值时使用。它不读取或改变页面状态，风险等级为 safe，不触发 approval；返回 ASK_USER_REQUIRED 让 runtime 停止自动推进并展示问题。
 */
export const bhAgentAskUser: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_ask_user',
  // 请求用户补充输入。
  ...toolMeta('Agent Ask User', 'Requests user input before continuing', 'tool.title.bh_agent_ask_user', 'tool.description.bh_agent_ask_user'),
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
