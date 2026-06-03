import { z } from 'zod';

import { defaultDocumentManager } from '../../background/document-manager';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const docReadUrlArgsSchema = z.object({
  url: z.url(),
  maxChars: z.number().int().positive().max(60_000).optional(),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional()
}).strict();

/**
 * 读取浏览器可访问文档 URL。
 *
 * Agent 语义：Advanced 只读文档工具，用于读取文本文件或可 fetch 的 PDF 文本。
 * 不修改页面、不下载到本地、不读取任意本地路径，风险 safe，不触发 approval。返回文本、
 * 页码范围、总页数、是否 scanned/无可抽取文本，以及是否因预算被截断。
 */
export function bhDocReadUrl(): ToolSpec<z.infer<typeof docReadUrlArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.DOC_READ_URL,
    title: 'Read Document URL',
    description: 'Reads text or PDF content from a browser-accessible URL with page and truncation metadata.',
    modes: ['advanced'],
    risk: 'safe',
    argsSchema: docReadUrlArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async (args) => {
      try {
        const document = await defaultDocumentManager.readUrl(docReadOptions(args));
        return {
          ok: true,
          code: ERROR_CODES.OK,
          summary: document.scanned
            ? `Read ${document.mimeType}; no extractable text found.`
            : `Read ${document.text.length} characters from ${document.mimeType}: ${textPreview(document.text)}`,
          data: { document },
          changedPage: false,
          requiresObserve: false,
          context: {
            visibility: 'summary',
            summary: document.text.slice(0, 1_200) || 'Document has no extractable text.'
          }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'document_read_failed';
        return {
          ok: false,
          code: ERROR_CODES.DOCUMENT_READ_FAILED,
          summary: message,
          error: { message },
          changedPage: false,
          requiresObserve: false,
          context: {
            visibility: 'summary',
            summary: `${ERROR_CODES.DOCUMENT_READ_FAILED}: ${message}`
          }
        };
      }
    }
  };
}

function textPreview(text: string): string {
  return text.replace(/\s+/gu, ' ').trim().slice(0, 160) || 'empty text';
}

function docReadOptions(args: z.infer<typeof docReadUrlArgsSchema>) {
  return {
    url: args.url,
    ...(args.maxChars !== undefined ? { maxChars: args.maxChars } : {}),
    ...(args.pageStart !== undefined ? { pageStart: args.pageStart } : {}),
    ...(args.pageEnd !== undefined ? { pageEnd: args.pageEnd } : {})
  };
}
