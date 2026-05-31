import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const clipboardReadArgsSchema = z.object({}).strict();

const clipboardWriteArgsSchema = z.object({
  text: z.string().min(1).max(60_000)
}).strict();

/**
 * 请求读取系统剪贴板。
 *
 * Agent 语义：Advanced 高风险剪贴板工具，只创建 approval，不直接读取剪贴板。
 * 适用 full/advanced 工具路径；readOnly 为 true，但会读取用户系统剪贴板，因此风险 high。
 * 批准后由 ClipboardApprovalFlow 通过 offscreen document 读取，并在 trace/snapshot 中脱敏。
 */
export function bhClipboardReadWithApproval(): ToolSpec<z.infer<typeof clipboardReadArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL,
    title: 'Read Clipboard With Approval',
    description: 'Requests explicit user approval before reading clipboard text.',
    modes: ['advanced'],
    risk: 'high',
    argsSchema: clipboardReadArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: true,
    contextVisibility: 'summary',
    execute: () => Promise.resolve(approvalRequired('read'))
  };
}

/**
 * 请求写入系统剪贴板。
 *
 * Agent 语义：Advanced 高风险剪贴板工具，只创建 approval，不直接写入剪贴板。
 * 适用 full/advanced 工具路径；会改变用户系统剪贴板，风险 high。参数 text 在 trace
 * 和 approval preview 中必须脱敏；批准后由 ClipboardApprovalFlow 执行真实写入。
 */
export function bhClipboardWriteWithApproval(): ToolSpec<z.infer<typeof clipboardWriteArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
    title: 'Write Clipboard With Approval',
    description: 'Requests explicit user approval before writing clipboard text.',
    modes: ['advanced'],
    risk: 'high',
    argsSchema: clipboardWriteArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: false,
    requiresApproval: true,
    contextVisibility: 'summary',
    execute: (args) => Promise.resolve(approvalRequired('write', args.text.length))
  };
}

function approvalRequired(operation: 'read' | 'write', textLength?: number): ToolResult {
  const summary = operation === 'read'
    ? 'Clipboard read requires explicit approval; clipboard was not read.'
    : 'Clipboard write requires explicit approval; clipboard was not changed.';
  return {
    ok: false,
    code: ERROR_CODES.APPROVAL_REQUIRED,
    summary,
    data: {
      operation,
      ...(textLength !== undefined ? { textLength } : {})
    },
    changedPage: false,
    requiresObserve: false,
    requiresApproval: true,
    approval: {
      reason: `Clipboard ${operation} requires explicit user approval.`,
      risk: 'high',
      actionPreview: operation === 'read'
        ? 'Read clipboard text'
        : `Write ${textLength ?? 0} characters to clipboard`
    },
    context: {
      visibility: 'summary',
      summary
    }
  };
}
