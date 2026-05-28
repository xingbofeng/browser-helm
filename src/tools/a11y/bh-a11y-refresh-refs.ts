import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { a11ySnapshotSchema } from '../../shared/schemas/observation.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * 刷新当前页面的 stable ref 映射。
 *
 * 这是 Ask/Debug/Form 模式的安全只读工具，用于在页面变化或 ref 失效后重新生成 a11y snapshot 和 ref map，不改变页面状态，也不会触发 approval。返回值语义是最新可观察元素集合及其 refs。
 */
export function bhA11yRefreshRefs(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_refresh_refs',
    // 刷新当前页面 stable ref 映射。
    title: 'Refresh Refs',
    description: 'Refreshes the current page ref map',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    ui: {
      titleKey: 'tool.title.bh_a11y_refresh_refs',
      descriptionKey: 'tool.description.bh_a11y_refresh_refs',
    },
    async execute(_args, ctx) {
      const locale: Locale = ctx.locale ?? 'zh';
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.A11Y_REFRESH_REFS });
      if (!response.ok) {
        return {
          ok: false,
          code: response.code,
          summary: response.message,
          error: { message: response.message, detail: response.detail },
          changedPage: false,
          requiresObserve: true,
          context: {
            visibility: 'summary',
            summary: `${response.code}: ${response.message}`
          }
        };
      }
      if (!('snapshot' in response)) {
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          summary: t('tool.summary.bh_a11y_refresh_refs.missing', locale),
          error: { message: t('tool.summary.bh_a11y_refresh_refs.missing', locale) },
          changedPage: false,
          requiresObserve: true
        };
      }
      const snapshot = a11ySnapshotSchema.parse(response.snapshot);
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: t('tool.summary.bh_a11y_refresh_refs', locale, { count: String(snapshot.elements.length) }),
        data: snapshot,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `refs=${snapshot.elements.length}`
        }
      };
    }
  };
}
