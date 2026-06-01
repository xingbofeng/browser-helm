import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { storageAreaSchema, type StorageEntrySummary } from '../../shared/schemas/storage';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';

const storageListArgsSchema = z.object({
  area: storageAreaSchema,
  limit: z.number().int().positive().max(200).optional()
}).strict();

const storageGetArgsSchema = z.object({
  area: storageAreaSchema,
  key: z.string().min(1)
}).strict();

const storageSetArgsSchema = z.object({
  area: storageAreaSchema,
  key: z.string().min(1),
  value: z.string()
}).strict();

const storageDeleteArgsSchema = z.object({
  area: storageAreaSchema,
  key: z.string().min(1)
}).strict();

const storageClearArgsSchema = z.object({
  area: storageAreaSchema
}).strict();

/**
 * 列出页面 Web Storage 条目。
 *
 * Agent 语义：Advanced 只读诊断工具，用于用户明确要求检查 localStorage/sessionStorage
 * 状态时读取 key、长度和脱敏预览。不会修改页面，风险 medium，因为 storage 可能含 token；
 * 需要 domain consent，不触发 approval。主要参数为 area 和 limit，结果不返回原始敏感值。
 */
export function bhStorageList(rpc: ContentRpcClient): ToolSpec<z.infer<typeof storageListArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.STORAGE_LIST,
    title: 'List Web Storage',
    description: 'Lists localStorage or sessionStorage keys with masked value previews.',
    modes: ['advanced'],
    risk: 'medium',
    argsSchema: storageListArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async (args) => {
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.STORAGE_LIST,
        area: args.area,
        ...(args.limit !== undefined ? { limit: args.limit } : {})
      });
      if (!response.ok) {
        return failure(response.message, response.code);
      }
      if (!('storageList' in response)) {
        return failure('Storage list response is unavailable', ERROR_CODES.TOOL_EXECUTION_FAILED);
      }
      const result = response.storageList;
      return ok(summarizeStorageList(args.area, result.count, result.entries), { storageList: result });
    }
  };
}

/**
 * 读取单个页面 Web Storage 条目摘要。
 *
 * Agent 语义：Advanced 只读诊断工具，用于用户点名具体 key 时读取 localStorage 或
 * sessionStorage 的存在性、值长度和脱敏预览。不会返回敏感 key 的原始值，不修改页面；
 * 风险 medium，需要 domain consent，不触发 approval。
 */
export function bhStorageGet(rpc: ContentRpcClient): ToolSpec<z.infer<typeof storageGetArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.STORAGE_GET,
    title: 'Get Web Storage Entry',
    description: 'Reads one localStorage or sessionStorage entry as a masked summary.',
    modes: ['advanced'],
    risk: 'medium',
    argsSchema: storageGetArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async (args) => {
      const response = await rpc.request({
        type: CONTENT_RPC_MESSAGES.STORAGE_GET,
        area: args.area,
        key: args.key
      });
      if (!response.ok) {
        return failure(response.message, response.code);
      }
      if (!('storageGet' in response)) {
        return failure('Storage get response is unavailable', ERROR_CODES.TOOL_EXECUTION_FAILED);
      }
      const result = response.storageGet;
      return ok(
        summarizeStorageGet(args.area, args.key, result.entry),
        { storageGet: result }
      );
    }
  };
}

/**
 * 请求写入单个 Web Storage 条目。
 *
 * Agent 语义：Advanced 高风险 storage 写工具，只创建 approval，不直接修改页面。
 * 适用 full/advanced storage 任务；会改变 localStorage/sessionStorage，风险 high。
 * 主要参数为 area、key、value；value 在 trace 和 approval preview 中脱敏。批准后由
 * StorageApprovalFlow 执行真实写入并要求重新观察页面状态。
 */
export function bhStorageSetWithApproval(): ToolSpec<z.infer<typeof storageSetArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
    title: 'Set Web Storage With Approval',
    description: 'Requests explicit user approval before setting a localStorage or sessionStorage value.',
    modes: ['advanced'],
    risk: 'high',
    argsSchema: storageSetArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: false,
    requiresApproval: true,
    contextVisibility: 'summary',
    execute: (args) => Promise.resolve(storageApprovalRequired('set', args.area, args.key, args.value.length))
  };
}

/**
 * 请求删除单个 Web Storage 条目。
 *
 * Agent 语义：Advanced 高风险 storage 删除工具，只创建 approval，不直接修改页面。
 * 适用 full/advanced storage 任务；会改变页面存储状态，风险 high。主要参数为 area 和 key；
 * 批准后由 StorageApprovalFlow 执行真实删除，并返回受影响条目数。
 */
export function bhStorageDeleteWithApproval(): ToolSpec<z.infer<typeof storageDeleteArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL,
    title: 'Delete Web Storage With Approval',
    description: 'Requests explicit user approval before deleting one localStorage or sessionStorage key.',
    modes: ['advanced'],
    risk: 'high',
    argsSchema: storageDeleteArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: false,
    requiresApproval: true,
    contextVisibility: 'summary',
    execute: (args) => Promise.resolve(storageApprovalRequired('delete', args.area, args.key))
  };
}

/**
 * 请求清空一个 Web Storage 区域。
 *
 * Agent 语义：Advanced 高风险 storage 清空工具，只创建 approval，不直接修改页面。
 * 适用 full/advanced storage 任务；可能改变登录态、草稿和业务状态，风险 high。主要参数为
 * area；批准后由 StorageApprovalFlow 执行真实 clear，并要求重新观察页面状态。
 */
export function bhStorageClearWithApproval(): ToolSpec<z.infer<typeof storageClearArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL,
    title: 'Clear Web Storage With Approval',
    description: 'Requests explicit user approval before clearing localStorage or sessionStorage.',
    modes: ['advanced'],
    risk: 'high',
    argsSchema: storageClearArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: false,
    requiresApproval: true,
    contextVisibility: 'summary',
    execute: (args) => Promise.resolve(storageApprovalRequired('clear', args.area))
  };
}

function summarizeStorageList(area: string, count: number, entries: StorageEntrySummary[]): string {
  const preview = entries.slice(0, 8).map(formatStorageEntry).join(', ');
  const prefix = `Listed ${count} ${area} entr${count === 1 ? 'y' : 'ies'}`;
  return preview ? `${prefix}: ${preview}.` : `${prefix}.`;
}

function summarizeStorageGet(area: string, key: string, entry: StorageEntrySummary | undefined): string {
  if (!entry) {
    return `${area} entry ${key} was not found.`;
  }
  return `Read ${area} entry ${key}: ${formatStorageEntry(entry)}.`;
}

function formatStorageEntry(entry: StorageEntrySummary): string {
  const value = entry.masked
    ? '[MASKED]'
    : entry.valuePreview ?? '(empty)';
  return `${entry.key}=${value}`;
}

function storageApprovalRequired(
  operation: 'set' | 'delete' | 'clear',
  area: string,
  key?: string,
  valueLength?: number
): ToolResult {
  const target = key ? `${area}.${key}` : area;
  const summary = `Web Storage ${operation} requires explicit approval; ${target} was not changed.`;
  return {
    ok: false,
    code: ERROR_CODES.APPROVAL_REQUIRED,
    summary,
    data: {
      operation,
      area,
      ...(key ? { key } : {}),
      ...(valueLength !== undefined ? { valueLength } : {})
    },
    changedPage: false,
    requiresObserve: false,
    requiresApproval: true,
    approval: {
      reason: `Changing ${target} requires explicit user approval.`,
      risk: 'high',
      actionPreview: operation === 'set'
        ? `Set ${target} (${valueLength ?? 0} characters)`
        : `${operation === 'delete' ? 'Delete' : 'Clear'} ${target}`
    },
    context: {
      visibility: 'summary',
      summary
    }
  };
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

function failure(message: string, code: string): ToolResult {
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
