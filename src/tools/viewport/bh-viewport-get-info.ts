import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  target: z.enum(['page', 'iframe']).optional(),
  iframeId: z.string().min(1).optional()
});

/** 读取顶层页面或 iframe viewport/scroll 状态；Ask/Debug/Form/Act 可用，只读 safe。 */
export function bhViewportGetInfo(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.VIEWPORT_GET_INFO,
    title: 'Viewport Get Info',
    description: 'Reads viewport and scroll state for page or iframe',
    ui: {
      titleKey: 'tool.title.bh_viewport_get_info',
      descriptionKey: 'tool.description.bh_viewport_get_info',
    },
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const parsedFrameId = parseIframeId(args);
      if (!parsedFrameId.ok) {
        return {
          ok: false,
          code: ERROR_CODES.IFRAME_ID_INVALID,
          summary: parsedFrameId.message,
          error: { message: parsedFrameId.message },
          changedPage: false,
          requiresObserve: false
        };
      }
      const frameId = parsedFrameId.frameId;
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.VIEWPORT_GET_INFO, ...(frameId === undefined ? {} : { frameId }) });
      if (!response.ok || !('viewport' in response)) {
        const message = response.ok ? 'Viewport info did not return state' : response.message;
        return { ok: false, code: response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code, summary: message, error: { message }, changedPage: false, requiresObserve: false };
      }
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'Read viewport info',
        data: response.viewport,
        changedPage: false,
        requiresObserve: false,
        context: { visibility: 'summary', summary: JSON.stringify(response.viewport) }
      };
    }
  };
}

export function parseIframeId(
  args: { target?: string | undefined; iframeId?: string | undefined }
): { ok: true; frameId?: number | undefined } | { ok: false; message: string } {
  if (args.target !== 'iframe') {
    return { ok: true };
  }
  const match = /^frame_(\d+)$/u.exec(args.iframeId ?? '');
  if (!match) {
    return { ok: false, message: 'iframeId must look like frame_<number>' };
  }
  return { ok: true, frameId: Number(match[1]) };
}
