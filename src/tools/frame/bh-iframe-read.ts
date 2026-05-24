import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';
import { parseFrameRef } from './frame-ref';

const argsSchema = z.object({
  refId: z.string().min(1),
  frameId: z.number().int().nonnegative().optional()
});

/**
 * Reads a target element inside an iframe by composite stable ref.
 *
 * Use this read-only Debug/Act tool when the Agent needs to inspect an iframe
 * target before deciding whether a controlled action is appropriate. It parses
 * `frame_<id>:ref_<id>`, routes the request to the target frame, returns a
 * prefixed ref summary, and asks the caller to re-observe when the frame/ref is
 * unavailable. It never mutates page state and never triggers approval.
 */
export function bhIframeRead(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: 'bh_iframe_read',
    // 读取 iframe 内 stable ref 的只读摘要，用于动作前确认目标。
    title: 'Read Iframe Target',
    description: 'Reads an iframe target by composite stable ref_id',
    modes: ['debug', 'act'],
    risk: 'low',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const parsed = parseFrameRef(args);
      if (!parsed.ok) {
        return failure(parsed.code, parsed.message, false);
      }
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.IFRAME_READ,
        frameId: parsed.frameId,
        refId: parsed.innerRefId
      });
      if (!response.ok) {
        return failure(response.code, response.message, true, response.detail);
      }
      if (!('ref' in response)) {
        return failure(
          ERROR_CODES.OBSERVATION_FAILED,
          'Content RPC did not return an iframe ref',
          true
        );
      }
      const ref = prefixRef(response.ref, parsed.frameId);
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Read iframe target ${args.refId}`,
        data: {
          frameId: parsed.frameId,
          ref
        },
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: `${args.refId}: ${readName(ref)}`
        }
      };
    }
  };
}

function failure(
  code: string,
  message: string,
  requiresObserve: boolean,
  detail?: unknown
): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: { message, detail },
    changedPage: false,
    requiresObserve,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}

function prefixRef(ref: unknown, frameId: number): unknown {
  if (typeof ref !== 'object' || ref === null) {
    return ref;
  }
  const record = ref as Record<string, unknown>;
  return {
    ...record,
    refId:
      typeof record.refId === 'string'
        ? `frame_${frameId}:${record.refId}`
        : `frame_${frameId}:unknown`
  };
}

function readName(ref: unknown): string {
  if (typeof ref !== 'object' || ref === null) {
    return 'unknown';
  }
  const name = (ref as Record<string, unknown>).name;
  return typeof name === 'string' && name.length > 0 ? name : 'unknown';
}
