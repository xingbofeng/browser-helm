import { z } from 'zod';

import { defaultDownloadManager } from '../../background/download-manager';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const downloadListArgsSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  state: z.enum(['in_progress', 'interrupted', 'complete']).optional()
}).strict();

const fileReadDownloadArgsSchema = z.object({
  downloadId: z.number().int().positive()
}).strict();

const fileUploadWithApprovalArgsSchema = z.object({
  targetRefId: z.string().min(1),
  fileName: z.string().min(1).optional(),
  reason: z.string().min(1).optional()
}).strict();

/**
 * 列出浏览器下载记录。
 *
 * Agent 语义：Advanced 只读文件上下文工具，用于发现最近下载的文件元数据。
 * 不读取文件内容、不打开本地路径、不修改页面，风险 safe，不触发 approval。结果会移除
 * URL query/hash，并只返回文件 basename，避免本地路径和 token 进入 trace/model context。
 */
export function bhDownloadList(): ToolSpec<z.infer<typeof downloadListArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.DOWNLOAD_LIST,
    title: 'List Downloads',
    description: 'Lists recent browser downloads with redacted URLs and local file paths.',
    modes: ['advanced'],
    risk: 'safe',
    argsSchema: downloadListArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async (args) => {
      try {
        const downloads = await defaultDownloadManager.listDownloads(downloadListOptions(args));
        return ok(`Listed ${downloads.length} downloads.`, { downloads });
      } catch (error) {
        return failure(error, ERROR_CODES.RUNTIME_UNAVAILABLE);
      }
    }
  };
}

function downloadListOptions(args: z.infer<typeof downloadListArgsSchema>) {
  return {
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    ...(args.state !== undefined ? { state: args.state } : {})
  };
}

/**
 * 描述已下载文件读取边界。
 *
 * Agent 语义：Advanced 文件读取工具的安全外壳，用于解释指定 downloadId 为什么不能
 * 直接从扩展读取任意本地文件内容。读取本地文件内容属于敏感文件动作，风险 high，必须
 * approval；当前实现返回结构化 limitation 和 fallback，不泄露本地路径。
 */
export function bhFileReadDownload(): ToolSpec<z.infer<typeof fileReadDownloadArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.FILE_READ_DOWNLOAD,
    title: 'Read Downloaded File',
    description: 'Explains the safe boundary for reading a downloaded local file by download id.',
    modes: ['advanced'],
    risk: 'high',
    argsSchema: fileReadDownloadArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: true,
    approvalBehavior: 'record_only',
    contextVisibility: 'summary',
    execute: async (args) => {
      try {
        const limitation = await defaultDownloadManager.describeDownloadedFile(args.downloadId);
        return {
          ok: false,
          code: ERROR_CODES.FILE_READ_UNAVAILABLE,
          summary: `Downloaded file ${args.downloadId} cannot be read directly by the extension.`,
          data: limitation,
          error: { message: limitation.reason },
          nextHints: [limitation.fallback],
          changedPage: false,
          requiresObserve: false,
          requiresApproval: true,
          approval: {
            reason: 'Reading downloaded local file content requires explicit user approval.',
            risk: 'high',
            actionPreview: `Read downloaded file ${limitation.download.fileName ?? args.downloadId}`
          },
          context: {
            visibility: 'summary',
            summary: `${ERROR_CODES.FILE_READ_UNAVAILABLE}: ${limitation.reason}`
          }
        };
      } catch (error) {
        return failure(error, ERROR_CODES.FILE_READ_UNAVAILABLE);
      }
    }
  };
}

/**
 * 创建文件上传审批边界。
 *
 * Agent 语义：Advanced 高风险上传工具的安全外壳，用于在遇到 file input 或上传按钮时
 * 明确进入 approval 流程。工具调用本身不读取本地文件路径、不设置 file input、不修改页面；
 * approval 只记录用户确认，真实文件选择仍必须由用户通过浏览器文件选择器完成。
 */
export function bhFileUploadWithApproval(): ToolSpec<z.infer<typeof fileUploadWithApprovalArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL,
    title: 'Upload File With Approval',
    description: 'Requests explicit user approval before any file upload handoff.',
    modes: ['advanced'],
    risk: 'high',
    argsSchema: fileUploadWithApprovalArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: false,
    requiresApproval: true,
    approvalBehavior: 'record_only',
    contextVisibility: 'summary',
    execute: (args) => {
      const fileName = args.fileName ? basename(args.fileName) : undefined;
      const actionPreview = `Upload${fileName ? ` ${fileName}` : ' a user-selected file'} to ${args.targetRefId}`;
      return Promise.resolve({
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUIRED,
        summary: 'File upload requires explicit user approval and manual file picker handoff.',
        data: {
          targetRefId: args.targetRefId,
          ...(fileName ? { fileName } : {}),
          reason: args.reason ?? 'file_upload_requires_user_approval',
          limitation: 'Browser extensions cannot safely receive or infer arbitrary local file paths from the agent.'
        },
        nextHints: [
          'Ask the user to choose the local file in the browser file picker after approval.',
          'Do not invent or read a local file path from the page context.'
        ],
        changedPage: false,
        requiresObserve: false,
        requiresApproval: true,
        approval: {
          reason: 'Uploading a local file requires explicit user approval.',
          risk: 'high',
          actionPreview
        },
        context: {
          visibility: 'summary',
          summary: `${ERROR_CODES.APPROVAL_REQUIRED}: ${actionPreview}`
        }
      });
    }
  };
}

function basename(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

function ok(summary: string, data: unknown): ToolResult {
  return {
    ok: true,
    code: ERROR_CODES.OK,
    summary,
    data,
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary
    }
  };
}

function failure(error: unknown, code: string): ToolResult {
  const message = error instanceof Error ? error.message : 'file_tool_failed';
  return {
    ok: false,
    code,
    summary: message,
    error: { message },
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}
