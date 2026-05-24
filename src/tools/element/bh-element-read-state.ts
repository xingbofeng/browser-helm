import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import {
  elementReadStatePayloadSchema,
  interactiveElementSchema
} from '../../shared/schemas/structured-page-data.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  refId: z.string().min(1)
});

/**
 * Reads visible, disabled, checked, and selected state for one ref.
 *
 * Use this safe Debug/Form tool to verify current element state without
 * rereading a full form or page. The `refId` parameter names the target stable
 * ref; the tool is read-only, never triggers approval, and returns a compact
 * state payload or structured stale-ref failure.
 */
export function bhElementReadState(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_element_read_state',
    // 读取单个 stable ref 的只读状态，用于确认 visible/disabled/checked/selected。
    title: 'Read Element State',
    description: 'Reads visible, disabled, checked, and selected state by ref_id',
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
      const payload = elementReadStatePayloadSchema.parse({
        refId: element.refId,
        visible: element.visible,
        disabled: element.disabled,
        checked: element.checked,
        selected: element.selected,
        warnings: element.warnings
      });

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Read state for ${args.refId}`,
        data: payload,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `${element.refId}: visible=${element.visible}, disabled=${element.disabled}`
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
