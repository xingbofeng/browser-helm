import { z } from 'zod';

import { observationSchema } from '../../shared/schemas/observation.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import { compressObservation } from '../../page/observe/observation-compressor';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

export function bhPageObserve(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_page_observe',
    title: 'Page Observe',
    description: 'Observes the current page and returns a bounded summary',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const response = await rpc.request({ type: 'BH_PAGE_OBSERVE' });
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
          code: 'OBSERVATION_FAILED',
          summary: 'Content RPC did not return an observation',
          error: {
            message: 'Content RPC did not return an observation'
          },
          changedPage: false,
          requiresObserve: true
        };
      }

      const observation = observationSchema.parse(response.observation);
      const summary = compressObservation(observation);
      return {
        ok: true,
        code: 'OK',
        summary: `Observed ${summary.currentDomain}: ${summary.pageStateSummary}`,
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
