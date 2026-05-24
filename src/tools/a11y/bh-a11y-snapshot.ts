import { z } from 'zod';

import { a11ySnapshotSchema } from '../../shared/schemas/observation.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

export function bhA11ySnapshot(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_snapshot',
    title: 'A11y Snapshot',
    description: 'Returns an accessibility-like snapshot with stable refs',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const response = await rpc.request({ type: 'BH_A11Y_SNAPSHOT' });
      if (!response.ok) {
        return failure(response.code, response.message, response.detail);
      }
      if (!('snapshot' in response)) {
        return failure(
          'OBSERVATION_FAILED',
          'Content RPC did not return an a11y snapshot'
        );
      }
      const snapshot = a11ySnapshotSchema.parse(response.snapshot);
      return {
        ok: true,
        code: 'OK',
        summary: `Captured ${snapshot.elements.length} interactive refs`,
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
