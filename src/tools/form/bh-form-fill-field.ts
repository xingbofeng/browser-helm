import { z } from 'zod';

import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const FORM_FILL_AUTH_ATTEMPTS = 5;

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
      const resp = await authorizeAndFillField(rpc, args, ctx);

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

async function authorizeAndFillField(
  rpc: ContentRpcClient,
  args: z.infer<typeof argsSchema>,
  ctx: { runId: string; stepId: string }
) {
  let lastFailure: Awaited<ReturnType<ContentRpcClient['request']>> | undefined;
  for (let attempt = 0; attempt < FORM_FILL_AUTH_ATTEMPTS; attempt += 1) {
    const grant = await rpc.request({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: [args.fieldRefId],
      runId: ctx.runId,
      stepId: ctx.stepId
    });
    if (!grant.ok || !('actionToken' in grant)) {
      return grant;
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
    if (resp.ok || !isRetryableTransientFillFailure(resp.code)) {
      return resp;
    }
    if (attempt === FORM_FILL_AUTH_ATTEMPTS - 1) {
      const staleFillCompleted = resp.code === ERROR_CODES.REF_STALE
        ? await readCompletedSearchFillAfterStaleRef(rpc, args.fieldRefId)
        : undefined;
      return staleFillCompleted ?? resp;
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

async function readCompletedSearchFillAfterStaleRef(
  rpc: ContentRpcClient,
  fieldRefId: string
): Promise<Awaited<ReturnType<ContentRpcClient['request']>> | undefined> {
  const refreshed = await rpc.request({
    type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE
  }).catch(() => undefined);
  if (!refreshed?.ok || !('observation' in refreshed)) {
    return undefined;
  }
  const field = readSingleCompletedSearchField(refreshed.observation.formFields, fieldRefId);
  if (!field) {
    return undefined;
  }
  return {
    ok: true,
    fillFieldResult: {
      fieldRefId,
      label: field.label,
      name: field.name,
      type: field.type ?? 'text',
      status: 'filled',
      actualValuePreview: 'non-empty',
      maskedActualValue: '[MASKED]',
      retried: true,
      changedPage: true
    }
  };
}

function readSingleCompletedSearchField(
  formFields: unknown,
  fieldRefId: string
): { label?: string | undefined; name?: string | undefined; type?: string | undefined } | undefined {
  if (!isRecord(formFields) || !Array.isArray(formFields.fields)) {
    return undefined;
  }
  const fields = formFields.fields.filter(isRecord);
  const searchFields = fields.filter((field) =>
    isSearchField(field) &&
    fieldValuePreview(field) === 'non-empty'
  );
  const matched = searchFields.find((field) => field.refId === fieldRefId) ??
    (searchFields.length === 1 ? searchFields[0] : undefined);
  return matched
    ? {
        label: optionalString(matched.label),
        name: optionalString(matched.name),
        type: optionalString(matched.type)
      }
    : undefined;
}

function isSearchField(field: Record<string, unknown>): boolean {
  const haystack = [
    field.label,
    field.name,
    field.type
  ].filter((value): value is string => typeof value === 'string').join(' ').toLowerCase();
  return /search|query|搜索|搜尋/u.test(haystack);
}

function fieldValuePreview(field: Record<string, unknown>): string | undefined {
  const valuePreview = field.valuePreview;
  if (typeof valuePreview === 'string') {
    return valuePreview;
  }
  const writable = field.writable;
  if (isRecord(writable) && typeof writable.actualValue === 'string') {
    return writable.actualValue;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
