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
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const frameId = parseIframeId(args);
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

export function parseIframeId(args: { target?: string | undefined; iframeId?: string | undefined }): number | undefined {
  if (args.target !== 'iframe') {
    return undefined;
  }
  const match = /^frame_(\d+)$/u.exec(args.iframeId ?? '');
  if (!match) {
    throw new Error('iframeId must look like frame_<number>');
  }
  return Number(match[1]);
}
