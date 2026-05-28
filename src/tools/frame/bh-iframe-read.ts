import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';
import { parseFrameRef } from './frame-ref';

const argsSchema = z.union([
  z.object({
    refId: z.string().min(1),
    frameId: z.number().int().nonnegative().optional()
  }),
  z.object({
    iframeId: z.string().min(1),
    mode: z.enum(['summary', 'visible_text', 'article']).optional(),
    cursor: z.number().int().nonnegative().optional(),
    maxChars: z.number().int().positive().max(50_000).optional(),
    includeHeadings: z.boolean().optional(),
    includeLinks: z.boolean().optional(),
    linkLimit: z.number().int().nonnegative().max(200).optional()
  })
]);

/**
 * 通过复合 stable ref 读取 iframe 内的目标元素。
 *
 * 面向 Debug/Act 模式的只读工具，供 Agent 在决定是否执行受控动作之前检查 iframe
 * 目标。解析 `frame_<id>:ref_<id>`，将请求路由到目标 frame，返回带前缀的 ref
 * 摘要，当 frame/ref 不可用时提示调用方重新 observation。不修改页面状态，永不触发
 * approval。
 */
export function bhIframeRead(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.IFRAME_READ,
    // 读取 iframe 文档或 iframe 内 stable ref 的只读摘要。
    title: 'Read Iframe Target',
    description: 'Reads an iframe document by iframeId or a target by composite stable ref_id',
    ui: {
      titleKey: 'tool.title.bh_iframe_read',
      descriptionKey: 'tool.description.bh_iframe_read',
    },
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute(args) {
      if ('iframeId' in args) {
        const parsedIframeId = parseIframeId(args.iframeId);
        if (!parsedIframeId.ok) {
          return failure(ERROR_CODES.IFRAME_ID_INVALID, parsedIframeId.message, false);
        }
        const frameId = parsedIframeId.frameId;
        const type = args.mode === 'article'
          ? CONTENT_RPC_MESSAGES.PAGE_READ_ARTICLE
          : CONTENT_RPC_MESSAGES.PAGE_READ_VISIBLE_TEXT;
        const response = await rpc.request({
          type,
          frameId,
          cursor: args.cursor,
          maxChars: args.maxChars,
          ...(type === CONTENT_RPC_MESSAGES.PAGE_READ_ARTICLE
            ? {
                includeHeadings: args.includeHeadings,
                includeLinks: args.includeLinks,
                linkLimit: args.linkLimit
              }
            : {})
        });
        if (!response.ok || !('pageRead' in response)) {
          const message = response.ok ? 'Iframe read did not return text' : response.message;
          return failure(response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code, message, false);
        }
        return {
          ok: true,
          code: ERROR_CODES.OK,
          summary: `Read iframe ${args.iframeId}${response.pageRead.hasMore ? ' (truncated)' : ''}`,
          data: {
            iframeId: args.iframeId,
            frameId,
            ...response.pageRead
          },
          nextHints: response.pageRead.hasMore ? ['IFRAME_TRUNCATED: Continue with nextCursor'] : undefined,
          changedPage: false,
          requiresObserve: false,
          context: {
            visibility: 'summary',
            summary: `${args.iframeId}: ${response.pageRead.text.slice(0, 1_200)}`
          }
        };
      }
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

function parseIframeId(iframeId: string): { ok: true; frameId: number } | { ok: false; message: string } {
  const match = /^frame_(\d+)$/u.exec(iframeId);
  if (!match) {
    return { ok: false, message: 'iframeId must look like frame_<number>' };
  }
  return { ok: true, frameId: Number(match[1]) };
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
