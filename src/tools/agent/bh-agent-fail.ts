import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { toolResultSchema } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  message: z.string().min(1),
  code: z.string().min(1).optional()
});

/**
 * 以结构化错误结束当前 Agent 运行。
 *
 * 这是内部 Agent 工具，用于 agent loop 判定任务无法继续、缺少能力或遇到不可恢复错误时返回失败结果。它不读取或改变页面状态，风险等级为 safe，不触发 approval；返回值包含用户可读 message 和错误 code。
 */
export const bhAgentFail: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_agent_fail',
  // 以结构化错误结束当前运行。
  title: 'Agent Fail',
  description: 'Fails current run with structured error',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  ui: {
    titleKey: 'tool.title.bh_agent_fail',
    descriptionKey: 'tool.description.bh_agent_fail',
  },
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
