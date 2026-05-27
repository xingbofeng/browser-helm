import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';
import { parseIframeId } from './bh-viewport-get-info';

const argsSchema = z.object({
  target: z.enum(['page', 'iframe']).optional(),
  iframeId: z.string().min(1).optional(),
  direction: z.enum(['up', 'down', 'left', 'right']),
  amount: z.union([
    z.enum(['half', 'page', 'end']),
    z.object({ pixels: z.number().int().positive().max(50_000) })
  ])
});

/** 滚动顶层页面或 iframe viewport；Ask/Debug/Form/Act 可用，低风险，会改变 viewport 并要求重新 observe/read。 */
export function bhViewportScroll(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.VIEWPORT_SCROLL,
    title: 'Viewport Scroll',
    description: 'Scrolls the page or iframe viewport and requires a follow-up observe/read',
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'low',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const frameId = parseIframeId(args);
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.VIEWPORT_SCROLL,
        direction: args.direction,
        amount: args.amount,
        ...(frameId === undefined ? {} : { frameId })
      });
      if (!response.ok || !('viewport' in response)) {
        const message = response.ok ? 'Viewport scroll did not return state' : response.message;
        return { ok: false, code: response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code, summary: message, error: { message }, changedPage: false, requiresObserve: true };
      }
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: response.didScroll ? 'Scrolled viewport' : 'Viewport at boundary',
        data: {
          before: response.before,
          after: response.after,
          viewport: response.viewport,
          didScroll: response.didScroll,
          atBoundary: response.atBoundary
        },
        changedPage: true,
        requiresObserve: true,
        nextHints: ['Viewport has changed. Run bh_page_wait_until_stable then observe/read.'],
        context: { visibility: 'summary', summary: JSON.stringify({ after: response.viewport }) }
      };
    }
  };
}
