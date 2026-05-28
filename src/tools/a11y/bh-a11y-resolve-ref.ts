import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';
import type { ToolSpec } from '../core/tool-spec';

import { toolMeta } from '../core/tool-meta';

const argsSchema = z.object({
  refId: z.string().min(1)
});

/**
 * 解析 stable ref 对应的当前页面元素。
 *
 * 这是 Ask/Debug/Form 模式的安全只读工具，用于把 agent 已持有的 refId 重新解析为当前 DOM 元素摘要，不改变页面状态，也不会触发 approval。主要参数是 refId；当 ref 过期时返回需要重新观察的失败结果。
 */
export function bhA11yResolveRef(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_resolve_ref',
    // 解析 stable ref 对应的页面元素。
    ...toolMeta('Resolve Ref', 'Resolves a stable ref_id to the current page element summary', 'tool.title.bh_a11y_resolve_ref', 'tool.description.bh_a11y_resolve_ref'),
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args, ctx) {
      const locale: Locale = ctx.locale ?? 'zh';
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: args.refId
      });
      if (!response.ok) {
        return {
          ok: false,
          code: response.code,
          summary: response.message,
          error: { message: response.message, detail: response.detail },
          changedPage: false,
          requiresObserve: response.code === ERROR_CODES.REF_STALE,
          context: {
            visibility: 'summary',
            summary: `${response.code}: ${response.message}`
          }
        };
      }
      if (!('ref' in response)) {
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          summary: t('tool.summary.bh_a11y_resolve_ref.missing', locale),
          error: { message: t('tool.summary.bh_a11y_resolve_ref.missing', locale) },
          changedPage: false,
          requiresObserve: true
        };
      }
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: t('tool.summary.bh_a11y_resolve_ref', locale, { refId: args.refId }),
        data: response.ref,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `Resolved ${args.refId}`
        }
      };
    }
  };
}
