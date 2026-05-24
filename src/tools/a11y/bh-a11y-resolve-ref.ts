import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  refId: z.string().min(1)
});

/**
 * Resolves one stable `refId` to the current element summary.
 *
 * Use this safe Ask/Debug/Form tool before inspecting or diagnosing a specific
 * element. The `refId` parameter names the stable ref to resolve; the tool is
 * read-only, never triggers approval, and returns either the current ref
 * summary or a structured stale/unavailable error.
 */
export function bhA11yResolveRef(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_a11y_resolve_ref',
    // 将已有 ref_id 解析回当前页面元素摘要，用于确认 ref 是否仍然有效。
    title: 'Resolve Ref',
    description: 'Resolves a stable ref_id to the current page element summary',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: args.refId
      });
      if (!response.ok) {
        return {
          ok: false,
          code: response.code,
          summary: response.message,
          error: { message: response.message, detail: response.detail },
          changedPage: false,
          requiresObserve: response.code === ERROR_CODES.REF_STALE,
          context: {
            visibility: 'summary',
            summary: `${response.code}: ${response.message}`
          }
        };
      }
      if (!('ref' in response)) {
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          summary: 'Content RPC did not return a resolved ref',
          error: { message: 'Content RPC did not return a resolved ref' },
          changedPage: false,
          requiresObserve: true
        };
      }
      return {
        ok: true,
        code: ERROR_CODES.OK,
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
