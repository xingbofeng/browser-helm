import { z } from 'zod';

import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  fieldRefId: z.string().min(1),
  value: z.string(),
  clear: z.boolean().optional(),
});

/**
 * 通过 content-script RPC 填写单个表单字段。
 *
 * Form 模式可变工具，将请求的值写入目标字段并派发 input/change/blur 事件。守卫检查
 * （disabled、readonly、sensitive、file、hidden、honeypot）在 content script 中
 * 强制执行；被跳过的字段返回结构化跳过原因。
 *
 * - **运行模式：** form
 * - **读写：** 写入页面 DOM
 * - **风险等级：** medium
 * - **Approval：** 不需要
 */
export function bhFormFillField(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.FORM_FILL_FIELD,
    // 填写单个表单字段。
    ...toolMeta('Fill Single Field', 'Fills a single form field with guard checks and event dispatch.', 'tool.title.bh_form_fill_field', 'tool.description.bh_form_fill_field'),
    modes: ['form'],
    risk: 'medium',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args, ctx) {
      const grant = await rpc.request({
        type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
        action: 'fill',
        fieldRefIds: [args.fieldRefId],
        runId: ctx.runId,
        stepId: ctx.stepId
      });
      if (!grant.ok || !('actionToken' in grant)) {
        const message = grant.ok ? 'form fill authorization failed' : grant.message;
        return {
          ok: false,
          code: grant.ok ? ERROR_CODES.FORM_ACTION_UNAUTHORIZED : grant.code,
          summary: message,
          error: { message },
          changedPage: false,
          requiresObserve: false
        };
      }
      const resp = await rpc.request({
        type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
        fieldRefId: args.fieldRefId,
        value: args.value,
        clear: args.clear,
        actionToken: grant.actionToken,
        runId: ctx.runId,
        stepId: ctx.stepId
      });

      if (!resp.ok) {
        return {
          ok: false,
          code: resp.code ?? ERROR_CODES.TOOL_EXECUTION_FAILED,
          summary: resp.message ?? 'fill field failed',
          error: { message: resp.message ?? 'fill field failed' },
          changedPage: false,
          requiresObserve: true,
        };
      }

      if (!('fillFieldResult' in resp)) {
        return {
          ok: false,
          code: ERROR_CODES.TOOL_EXECUTION_FAILED,
          summary: 'unexpected RPC response',
          error: { message: 'unexpected RPC response' },
          changedPage: false,
          requiresObserve: true,
        };
      }
      const data = resp.fillFieldResult;
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Filled field ${args.fieldRefId}`,
        data,
        changedPage: true,
        requiresObserve: false,
      };
    },
  };
}
