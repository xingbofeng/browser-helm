import type { z } from 'zod';

import { checkResolvedActionReadiness } from '../../page/dom/action-readiness';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import {
  actionIntentSchema,
  actionReadinessSchema
} from '../../shared/schemas/action-readiness.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = actionIntentSchema;

/**
 * 检查拟执行动作是否已经可安全执行。
 *
 * 这是 Debug/Act 模式的低风险只读工具，用于解析目标 ref 并评估点击、输入或提交动作的可见性、disabled 状态、风险和 approval 边界。它不会改变页面状态；返回值描述 canAct、risk、是否需要重新观察以及是否需要 approval。
 */
export function bhActionCheckReadiness(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_action_check_readiness',
    // 检查拟执行动作是否就绪。
    ...toolMeta('Check Action Readiness', 'Checks whether a proposed action is ready and whether it would require approval', 'tool.title.bh_action_check_readiness', 'tool.description.bh_action_check_readiness'),
    modes: ['debug', 'act'],
    risk: 'low',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args, ctx) {
      const locale: Locale = ctx.locale ?? 'zh';
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: args.refId
      });
      const readiness = response.ok && 'ref' in response
        ? checkResolvedActionReadiness(args, normalizeResolvedRef(args.refId, response.ref))
        : unresolvedReadiness(args, response, locale);

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: readiness.reason,
        data: actionReadinessSchema.parse(readiness),
        changedPage: false,
        requiresObserve: readiness.requiresObserve,
        context: {
          visibility: 'summary',
          summary: `${readiness.code}: ${readiness.reason}`
        }
      };
    }
  };
}

function normalizeResolvedRef(refId: string, ref: unknown) {
  const record = (typeof ref === 'object' && ref !== null ? ref : {}) as Record<
    string,
    unknown
  >;
  return {
    refId,
    role: typeof record.role === 'string' ? record.role : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
    tagName: typeof record.tagName === 'string' ? record.tagName : 'unknown',
    visible: typeof record.visible === 'boolean' ? record.visible : false,
    disabled: typeof record.disabled === 'boolean' ? record.disabled : false
  };
}

function unresolvedReadiness(
  args: z.infer<typeof argsSchema>,
  response: Awaited<ReturnType<ContentRpcClient['request']>>,
  locale: Locale
) {
  const code = response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code;
  const message = response.ok
    ? t('tool.summary.bh_a11y_resolve_ref.missing', locale)
    : response.message;
  return {
    canAct: false,
    code,
    reason: message,
    risk: args.kind === 'submit' ? 'high' as const : 'medium' as const,
    staleRefs: code === ERROR_CODES.REF_STALE,
    changedPage: false,
    requiresObserve: true,
    wouldRequireApproval: false,
    nextHints: ['Run bh_page_observe again']
  };
}
