import { z } from 'zod';

import { a11ySnapshotSchema } from '../../shared/schemas/observation.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

export function bhA11yRefreshRefs(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_refresh_refs',
    title: 'Refresh Refs',
    description: 'Refreshes the current page ref map',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const response = await rpc.request({ type: 'BH_A11Y_REFRESH_REFS' });
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
          code: 'OBSERVATION_FAILED',
          summary: 'Content RPC did not return a refreshed snapshot',
          error: { message: 'Content RPC did not return a refreshed snapshot' },
          changedPage: false,
          requiresObserve: true
        };
      }
      const snapshot = a11ySnapshotSchema.parse(response.snapshot);
      return {
        ok: true,
        code: 'OK',
        summary: `Ref map refreshed with ${snapshot.elements.length} refs`,
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
