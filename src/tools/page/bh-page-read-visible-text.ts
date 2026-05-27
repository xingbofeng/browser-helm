import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  cursor: z.number().int().nonnegative().optional(),
  maxChars: z.number().int().positive().max(50_000).optional()
});

/** 读取当前页面可见文本并支持 cursor 分页；Ask/Debug/Form 可用，只读 safe。 */
export function bhPageReadVisibleText(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
    title: 'Page Read Visible Text',
    description: 'Reads current page visible text with cursor pagination',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.PAGE_READ_VISIBLE_TEXT, ...args });
      if (!response.ok || !('pageRead' in response)) {
        const message = response.ok ? 'Page read did not return text' : response.message;
        return failed(response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code, message);
      }
      const data = response.pageRead;
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Read page text${data.hasMore ? ' (truncated)' : ''}: ${data.text.slice(0, 120)}`,
        data,
        nextHints: data.hasMore ? ['ARTICLE_TRUNCATED: Continue with nextCursor'] : undefined,
        changedPage: false,
        requiresObserve: false,
        context: { visibility: 'summary', summary: `${TOOL_NAMES.PAGE_READ_VISIBLE_TEXT}: ${data.text.slice(0, 1_200)}` }
      };
    }
  };
}

function failed(code: string, message: string): ToolResult {
  return { ok: false, code, summary: message, error: { message }, changedPage: false, requiresObserve: false };
}
