import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import {
  elementInspectPayloadSchema,
  interactiveElementSchema
} from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  refId: z.string().min(1)
});

/**
 * Inspects one interactive element by stable ref.
 *
 * Use this safe Debug/Form tool when the Agent needs a focused read-only
 * element summary before form diagnosis or action planning. The `refId`
 * parameter selects the stable ref; the tool never mutates page state, never
 * triggers approval, and returns role/name/tag/state details or a stale-ref
 * error.
 */
export function bhElementInspect(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_element_inspect',
    // 检查单个 stable ref 绑定的交互元素摘要，不猜测替代 selector。
    title: 'Inspect Element',
    description: 'Inspects one interactive element by stable ref_id',
    modes: ['debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
        refId: args.refId
      });
      if (!response.ok) {
        return failure(response.code, response.message, response.detail);
      }
      if (!('ref' in response)) {
        return failure(
          ERROR_CODES.OBSERVATION_FAILED,
          'Content RPC did not return a resolved ref'
        );
      }
      const element = interactiveElementSchema.parse({
        ...(response.ref as Record<string, unknown>),
        disabled: (response.ref as Record<string, unknown>).disabled ?? false,
        warnings: (response.ref as Record<string, unknown>).warnings ?? []
      });
      const payload = elementInspectPayloadSchema.parse({
        element,
        warnings: element.warnings
      });

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Inspected ${args.refId}`,
        data: payload,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `${element.refId}: ${element.role ?? 'unknown'} ${element.name ?? ''}`.trim()
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
    requiresObserve: code === ERROR_CODES.REF_STALE,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}
