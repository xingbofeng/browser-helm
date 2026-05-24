import { z } from 'zod';

import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  refId: z.string().min(1)
});

export function bhA11yResolveRef(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_resolve_ref',
    title: 'Resolve Ref',
    description: 'Resolves a stable ref_id to the current page element summary',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const response = await rpc.request({
        type: 'BH_A11Y_RESOLVE_REF',
        refId: args.refId
      });
      if (!response.ok) {
        return {
          ok: false,
          code: response.code,
          summary: response.message,
          error: { message: response.message, detail: response.detail },
          changedPage: false,
          requiresObserve: response.code === 'REF_STALE',
          context: {
            visibility: 'summary',
            summary: `${response.code}: ${response.message}`
          }
        };
      }
      if (!('ref' in response)) {
        return {
          ok: false,
          code: 'OBSERVATION_FAILED',
          summary: 'Content RPC did not return a resolved ref',
          error: { message: 'Content RPC did not return a resolved ref' },
          changedPage: false,
          requiresObserve: true
        };
      }
      return {
        ok: true,
        code: 'OK',
        summary: `Resolved ${args.refId}`,
        data: response.ref,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `Resolved ${args.refId}`
        }
      };
    }
  };
}
