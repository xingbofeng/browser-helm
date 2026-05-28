import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';
import { toolMeta } from '../core/tool-meta';

const argsSchema = z.object({});

/** 列出 iframe 并给出稳定 iframeId；Ask/Debug/Form/Act 可用，只读 safe。 */
export function bhIframeList(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.IFRAME_LIST,
    ...toolMeta('Iframe List', 'Lists iframes with stable iframeId metadata', 'tool.title.bh_iframe_list', 'tool.description.bh_iframe_list'),
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.FRAME_LIST });
      if (!response.ok || !('frames' in response)) {
        const message = response.ok ? 'Content RPC did not return frame metadata' : response.message;
        return { ok: false, code: response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code, summary: message, error: { message }, changedPage: false, requiresObserve: false };
      }
      const iframes = response.frames.filter((frame) => !frame.isTop).map((frame) => ({
        iframeId: `frame_${frame.frameId}`,
        frameId: frame.frameId,
        url: frame.url,
        parentFrameId: frame.parentFrameId,
        readable: 'unknown' as const
      }));
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Detected ${iframes.length} iframes`,
        data: { iframes },
        changedPage: false,
        requiresObserve: false,
        context: { visibility: 'summary', summary: JSON.stringify({ iframes }) }
      };
    }
  };
}
