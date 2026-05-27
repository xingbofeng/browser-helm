import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  cursor: z.number().int().nonnegative().optional(),
  maxChars: z.number().int().positive().max(50_000).optional(),
  includeHeadings: z.boolean().optional(),
  includeLinks: z.boolean().optional(),
  linkLimit: z.number().int().nonnegative().max(200).optional()
});

/** 读取 article/main 等正文区域，支持 headings/links 和分页；Ask/Debug/Form 可用，只读 safe。 */
export function bhPageReadArticle(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.PAGE_READ_ARTICLE,
    title: 'Page Read Article',
    description: 'Reads article-like main content with optional headings and links',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.PAGE_READ_ARTICLE, ...args });
      if (!response.ok || !('pageRead' in response)) {
        const message = response.ok ? 'Article read did not return text' : response.message;
        return { ok: false, code: response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code, summary: message, error: { message }, changedPage: false, requiresObserve: false };
      }
      const data = response.pageRead;
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Read article${data.hasMore ? ' (truncated)' : ''}: ${data.text.slice(0, 120)}`,
        data,
        nextHints: data.hasMore ? ['ARTICLE_TRUNCATED: Continue with nextCursor'] : undefined,
        changedPage: false,
        requiresObserve: false,
        context: { visibility: 'summary', summary: `article: ${data.text.slice(0, 1_200)}` }
      };
    }
  };
}
