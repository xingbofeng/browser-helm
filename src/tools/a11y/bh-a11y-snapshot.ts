import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { a11ySnapshotSchema } from '../../shared/schemas/observation.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';

import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * 读取当前页面的 a11y 风格快照。
 *
 * 这是 Ask/Debug/Form 模式的安全只读工具，用于返回带 stable refs 的可访问性近似树，帮助 agent 理解页面结构和交互目标，不改变页面状态，也不会触发 approval。返回值包含元素集合、origin 和观察警告。
 */
export function bhA11ySnapshot(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_snapshot',
    // 读取当前页面 a11y 快照。
    ...toolMeta('A11y Snapshot', 'Returns an accessibility-like snapshot with stable refs', 'tool.title.bh_a11y_snapshot', 'tool.description.bh_a11y_snapshot'),
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(_args, ctx) {
      const locale: Locale = ctx.locale ?? 'zh';
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
      if (!response.ok) {
        return failure(response.code, response.message, response.detail);
      }
      if (!('snapshot' in response)) {
        return failure(
          ERROR_CODES.OBSERVATION_FAILED,
          t('tool.summary.bh_a11y_snapshot.missing', locale)
        );
      }
      const snapshot = a11ySnapshotSchema.parse(response.snapshot);
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: t('tool.summary.bh_a11y_snapshot', locale, { count: String(snapshot.elements.length) }),
        data: snapshot,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `refs=${snapshot.elements.length}, origin=${snapshot.origin ?? 'unknown'}`
        }
      };
    }
  };
}

function failure(code: string, message: string, detail?: unknown): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: { message, detail },
    changedPage: false,
    requiresObserve: true,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}
