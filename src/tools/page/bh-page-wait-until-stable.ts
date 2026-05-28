import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';
import { toolMeta } from '../core/tool-meta';

const argsSchema = z.object({ quietMs: z.number().int().positive().max(5_000).optional() });

/** 等待页面稳定的轻量工具；Ask/Debug/Form/Act 可用，只读 safe，返回 readyState 和等待时间。 */
export function bhPageWaitUntilStable(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.PAGE_WAIT_UNTIL_STABLE,
    ...toolMeta('Page Wait Until Stable', 'Waits until the page is stable enough for a follow-up read', 'tool.title.bh_page_wait_until_stable', 'tool.description.bh_page_wait_until_stable'),
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.PAGE_WAIT_UNTIL_STABLE, ...args });
      if (!response.ok || !('stable' in response)) {
        const message = response.ok ? 'Page stable wait did not return state' : response.message;
        return { ok: false, code: response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code, summary: message, error: { message }, changedPage: false, requiresObserve: false };
      }
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'Page is stable, you can now re-observe or read',
        data: { stable: response.stable, readyState: response.readyState, waitedMs: response.waitedMs },
        changedPage: false,
        requiresObserve: false
      };
    }
  };
}
