import { z } from 'zod';

import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { fillManyResultSchema, type FillManyResult } from '../../shared/schemas/form-fill.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  formRefId: z.string().min(1).optional(),
  fields: z.array(z.object({
    fieldRefId: z.string().min(1),
    value: z.string(),
    clear: z.boolean().optional(),
  })),
});

/**
 * 批量填写一个表单的多个字段。
 *
 * Form 模式可变工具，将值写入单个表单中所有符合条件的字段。返回部分成功结果，
 * 每个字段标注 filled/skipped/failed/cleared 状态。
 *
 * - **运行模式：** form
 * - **读写：** 写入页面 DOM
 * - **风险等级：** medium
 * - **Approval：** 不需要
 */
export function bhFormFillMany(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.FORM_FILL_MANY,
    // 批量填写一个表单的多个字段。
    ...toolMeta('Batch Fill Many Fields', 'Batch-fills multiple form fields with partial-success results.', 'tool.title.bh_form_fill_many', 'tool.description.bh_form_fill_many'),
    modes: ['form'],
    risk: 'medium',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args, ctx) {
      const grant = await rpc.request({
        type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
        action: 'fill',
        fieldRefIds: args.fields.map((field) => field.fieldRefId),
        runId: ctx.runId,
        stepId: ctx.stepId
      });
      if (!grant.ok || !('actionToken' in grant)) {
        const message = grant.ok ? 'form fill authorization failed' : grant.message;
        return { ok: false, code: grant.ok ? ERROR_CODES.FORM_ACTION_UNAUTHORIZED : grant.code, summary: message, error: { message }, changedPage: false, requiresObserve: false };
      }
      const resp = await rpc.request({
        type: CONTENT_RPC_MESSAGES.FORM_FILL_MANY,
        targets: args.fields,
        actionToken: grant.actionToken,
        runId: ctx.runId,
        stepId: ctx.stepId
      });

      if (!resp.ok) {
        return { ok: false, code: resp.code ?? ERROR_CODES.TOOL_EXECUTION_FAILED, summary: 'batch fill failed', error: { message: 'batch fill failed' }, changedPage: false, requiresObserve: true };
      }

      if (!('fillManyResult' in resp)) {
        return { ok: false, code: ERROR_CODES.TOOL_EXECUTION_FAILED, summary: 'unexpected RPC response', error: { message: 'unexpected RPC response' }, changedPage: false, requiresObserve: true };
      }
      const result: FillManyResult = fillManyResultSchema.parse(resp.fillManyResult);
      return { ok: result.ok, code: result.ok ? ERROR_CODES.OK : ERROR_CODES.TOOL_EXECUTION_FAILED, summary: result.summary, data: result, changedPage: result.changedPage, requiresObserve: result.requiresObserve };
    },
  };
}
