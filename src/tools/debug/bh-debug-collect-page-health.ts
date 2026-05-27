import { z } from 'zod';

import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { pageHealthSummarySchema } from '../../shared/schemas/page-health.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

/**
 * 收集页面健康只读摘要。
 *
 * 面向 Debug 模式的安全诊断工具，供 Agent 获取浅层页面健康信号。通过 content RPC
 * 读取当前 observation，不使用 chrome.debugger/CDP，不修改页面状态，永不触发
 * approval，在浅层信号不可用时返回 console/network 的限制说明。
 */
export function bhDebugCollectPageHealth(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
    // 收集页面健康浅层摘要，只用于 Debug 模式诊断。
    title: 'Collect Page Health',
    description: 'Collects a read-only shallow page health summary',
    modes: ['debug'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
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
          summary: 'Content RPC did not return page observation',
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
