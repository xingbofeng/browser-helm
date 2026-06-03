import { z } from 'zod';

import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { pageHealthSummarySchema } from '../../shared/schemas/page-health.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';
import { toolMeta } from '../core/tool-meta';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * Agent 在 Debug run mode 中读取浅层页面健康摘要的只读诊断工具。
 *
 * 该工具不修改页面业务状态，风险等级为 safe，也不会直接触发 approval；它会先通过
 * content RPC 按需启用临时 page-health hook，再重新 observe 当前页面，从 observation
 * 中返回 console error、console message、network failure、表单存在性和浅层限制说明。
 * page-health hook 只是 CDP deep debug 不可用或无需完整 DevTools 数据时的 fallback，
 * 不是 DevTools/CDP 的完整替代。参数为空；典型使用时机是用户要求排查页面错误、
 * 网络失败、表单卡住或 Debug 面板需要展示浅层健康信号。
 */
export function bhDebugCollectPageHealth(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
    ...toolMeta('Collect Page Health', 'Collects a read-only shallow page health summary', 'tool.title.bh_debug_collect_page_health', 'tool.description.bh_debug_collect_page_health'),
    modes: ['debug'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(_args, ctx) {
      const locale: Locale = ctx.locale ?? 'zh';
      await rpc.request({ type: CONTENT_RPC_MESSAGES.PAGE_HEALTH_ENABLE }).catch(() => undefined);
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE });
      if (!response.ok) {
        return {
          ok: false,
          code: response.code,
          summary: response.message,
          error: {
            message: response.message,
            detail: response.detail
          },
          changedPage: false,
          requiresObserve: true
        };
      }
      if (!('observation' in response)) {
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          summary: t('tool.summary.bh_debug_collect_page_health.missing', locale),
          changedPage: false,
          requiresObserve: true
        };
      }

      const observation = response.observation;
      if (observation.pageHealth) {
        const payload = pageHealthSummarySchema.parse(observation.pageHealth);
        return {
          ok: true,
          code: ERROR_CODES.OK,
          summary: payload.pageStateSummary,
          data: payload,
          changedPage: false,
          requiresObserve: false,
          context: {
            visibility: 'summary',
            summary: payload.pageStateSummary
          }
        };
      }
      const hasForm =
        typeof observation.formFields === 'object' &&
        observation.formFields !== null &&
        'fields' in observation.formFields &&
        Array.isArray(observation.formFields.fields) &&
        observation.formFields.fields.length >= 0;
      const payload = pageHealthSummarySchema.parse({
        consoleErrors: [],
        networkFailures: [],
        hasForm,
        pageStateSummary: observation.pageStateSummary,
        limitations: ['CDP deep inspection unavailable']
      });

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: payload.pageStateSummary,
        data: payload,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: payload.pageStateSummary
        }
      };
    }
  };
}
