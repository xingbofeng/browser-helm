import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import {
  interactiveElementSchema,
  interactiveFindPayloadSchema,
  type InteractiveElement
} from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * 查找当前页面可交互元素。
 *
 * 这是 Debug/Form 模式的安全只读工具，用于从当前页面读取带 stable ref 的交互元素、状态和警告，不改变页面内容，也不会触发 approval。典型使用时机是 agent 需要重新定位可点击、可输入或可提交元素。
 */
export function bhA11yFindInteractive(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_find_interactive',
    // 查找当前页面可交互元素。
    title: 'Find Interactive Elements',
    description: 'Returns read-only interactive elements with refs and state',
    modes: ['debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    ui: {
      titleKey: 'tool.title.bh_a11y_find_interactive',
      descriptionKey: 'tool.description.bh_a11y_find_interactive',
    },
    async execute(_args, ctx) {
      const locale: Locale = ctx.locale ?? 'zh';
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
      if (!response.ok) {
        return failure(response.code, response.message, response.detail, true);
      }
      if (!('snapshot' in response)) {
        return failure(
          ERROR_CODES.OBSERVATION_FAILED,
          t('tool.summary.bh_a11y_snapshot.missing', locale),
          undefined,
          true
        );
      }

      const elements = normalizeElements(response.snapshot.elements ?? []);
      const payload = interactiveFindPayloadSchema.parse({
        status: elements.length > 0 ? 'ready' : 'empty',
        elements,
        count: elements.length,
        warnings: response.snapshot.warnings ?? []
      });
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary:
          elements.length > 0
            ? t('tool.summary.bh_a11y_find_interactive.found', locale, { count: String(elements.length) })
            : t('tool.summary.bh_a11y_find_interactive.empty', locale),
        data: payload,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `interactive=${elements.length}`
        }
      };
    }
  };
}

function normalizeElements(elements: unknown[]): InteractiveElement[] {
  return elements.map((element, index) => {
    const value =
      typeof element === 'object' && element !== null
        ? (element as Record<string, unknown>)
        : {};
    return interactiveElementSchema.parse({
      ...value,
      disabled: value.disabled ?? false,
      domOrder: value.domOrder ?? index,
      warnings: value.warnings ?? []
    });
  });
}

function failure(
  code: string,
  message: string,
  detail: unknown,
  requiresObserve: boolean
): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: { message, detail },
    changedPage: false,
    requiresObserve,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}
