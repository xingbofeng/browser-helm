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

const argsSchema = z.object({});

/**
 * Observes the current page and returns bounded structured context.
 *
 * Use this safe Ask/Debug/Form tool as the primary read-only page observation
 * entrypoint. It accepts no parameters, never mutates the page, never triggers
 * approval, and returns the raw observation plus a compact structured summary
 * for Agent context and follow-up ref-based tools.
 */
export function bhPageObserve(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_page_observe',
    // 读取当前页面的 bounded observation，并派生 structured context summary。
    title: 'Page Observe',
    description: 'Observes the current page and returns a bounded summary',
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
