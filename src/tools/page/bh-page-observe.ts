import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { observationSchema } from '../../shared/schemas/observation.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import {
  buildStructuredPageContextSummary,
  buildStructuredPageData
} from '../../page/structured/structured-page-data';
import type { ToolSpec } from '../core/tool-spec';
import { toolMeta } from '../core/tool-meta';

const argsSchema = z.object({});

/**
 * 观察当前页面并返回有界的结构化上下文。
 *
 * 面向 Ask/Debug/Form 模式的主要只读页面观察入口。不接受参数，不修改页面状态，
 * 永不触发 approval，返回原始 observation 及紧凑结构化摘要，供 Agent 上下文和后续
 * ref-based 工具使用。
 */
export function bhPageObserve(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_page_observe',
    // 读取当前页面的 bounded observation，并派生 structured context summary。
    ...toolMeta('Page Observe', 'Observes the current page and returns a bounded summary', 'tool.title.bh_page_observe', 'tool.description.bh_page_observe'),
    modes: ['ask', 'debug', 'form'],
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
          requiresObserve: true,
          context: {
            visibility: 'summary',
            summary: `${response.code}: ${response.message}`
          }
        };
      }
      if (!('observation' in response)) {
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          summary: 'Content RPC did not return an observation',
          error: {
            message: 'Content RPC did not return an observation'
          },
          changedPage: false,
          requiresObserve: true
        };
      }

      const observation = observationSchema.parse(response.observation);
      const structured = buildStructuredPageData(observation);
      const summary = buildStructuredPageContextSummary(structured);
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Observed ${summary.currentDomain}: ${summary.summary}`,
        data: observation,
        nextHints: ['Use ref_id values for follow-up page tools'],
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: JSON.stringify(summary)
        }
      };
    }
  };
}
