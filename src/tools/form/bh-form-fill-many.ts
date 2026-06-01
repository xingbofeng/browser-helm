import { z } from 'zod';

import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { fillManyResultSchema, type FillManyResult } from '../../shared/schemas/form-fill.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const FORM_FILL_AUTH_ATTEMPTS = 5;

const argsSchema = z.object({
  formRefId: z.preprocess((value) => value === null ? undefined : value, z.string().min(1).optional()),
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
      const resp = await authorizeAndFillMany(rpc, args, ctx);

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

async function authorizeAndFillMany(
  rpc: ContentRpcClient,
  args: z.infer<typeof argsSchema>,
  ctx: { runId: string; stepId: string }
) {
  let lastFailure: Awaited<ReturnType<ContentRpcClient['request']>> | undefined;
  for (let attempt = 0; attempt < FORM_FILL_AUTH_ATTEMPTS; attempt += 1) {
    const grant = await rpc.request({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: args.fields.map((field) => field.fieldRefId),
      runId: ctx.runId,
      stepId: ctx.stepId
    });
    if (!grant.ok || !('actionToken' in grant)) {
      return grant;
    }
    const resp = await rpc.request({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_MANY,
      targets: args.fields,
      actionToken: grant.actionToken,
      runId: ctx.runId,
      stepId: ctx.stepId
    });
    if (
      resp.ok ||
      !isRetryableTransientFillFailure(resp.code) ||
      attempt === FORM_FILL_AUTH_ATTEMPTS - 1
    ) {
      return resp;
    }
    lastFailure = resp;
    await refreshPageRefsAfterTransientFillFailure(rpc);
  }
  return lastFailure ?? {
    ok: false,
    code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED,
    message: 'form fill authorization failed'
  };
}

function isRetryableTransientFillFailure(code: string | undefined): boolean {
  return code === ERROR_CODES.FORM_ACTION_UNAUTHORIZED ||
    code === ERROR_CODES.TOOL_EXECUTION_FAILED ||
    code === ERROR_CODES.REF_STALE;
}

async function refreshPageRefsAfterTransientFillFailure(
  rpc: ContentRpcClient
): Promise<void> {
  await rpc.request({
    type: CONTENT_RPC_MESSAGES.PAGE_WAIT_UNTIL_STABLE,
    quietMs: 300
  }).catch(() => undefined);
  await rpc.request({
    type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE
  });
}
