import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { scratchpadSummarySchema } from '../../shared/schemas/scratchpad';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { defaultScratchpadRepo } from '../../storage/scratchpad-repo';
import type { ToolSpec } from '../core/tool-spec';

const runArgsSchema = z.object({ runId: z.string().min(1).optional() });
const writeArgsSchema = runArgsSchema.extend({ text: z.string() });
const compactArgsSchema = runArgsSchema.extend({
  maxChars: z.number().int().positive().max(8000).optional()
});

/**
 * 读取当前 run 的 scratchpad。
 *
 * Agent 语义：在长任务中取回压缩前保存的关键事实。只读、安全、不改页面、不触发 approval。
 * runId 可省略，默认使用 ToolContext.runId；返回 content 和字符数。
 */
export function bhPadRead(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof runArgsSchema>, ToolResult> {
  return padTool({
    name: TOOL_NAMES.PAD_READ,
    title: 'Scratchpad Read',
    description: 'Reads the current run scratchpad.',
    argsSchema: runArgsSchema,
    readOnly: true,
    execute: (args, runId) => result('Read scratchpad', summary(defaultScratchpadRepo.read(args.runId ?? runId)))
  });
}

/**
 * 追加 scratchpad 内容。
 *
 * Agent 语义：把长任务中的关键事实、进度或下步计划写入本地 run pad。会改变本地 pad，
 * 不改页面、不触发 approval。写入内容会脱敏。
 */
export function bhPadAppend(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof writeArgsSchema>, ToolResult> {
  return padTool({
    name: TOOL_NAMES.PAD_APPEND,
    title: 'Scratchpad Append',
    description: 'Appends redacted text to the current run scratchpad.',
    argsSchema: writeArgsSchema,
    execute: (args, runId) => result('Updated scratchpad', summary(defaultScratchpadRepo.append(args.runId ?? runId, args.text)))
  });
}

/**
 * 替换 scratchpad 内容。
 *
 * Agent 语义：用压缩后的摘要替换旧 pad。会改变本地 pad，不改页面、不触发 approval。
 */
export function bhPadReplace(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof writeArgsSchema>, ToolResult> {
  return padTool({
    name: TOOL_NAMES.PAD_REPLACE,
    title: 'Scratchpad Replace',
    description: 'Replaces the current run scratchpad.',
    argsSchema: writeArgsSchema,
    execute: (args, runId) => result('Replaced scratchpad', summary(defaultScratchpadRepo.replace(args.runId ?? runId, args.text)))
  });
}

/**
 * 清空 scratchpad。
 *
 * Agent 语义：清理当前 run pad。会改变本地 pad，不改页面、不触发 approval。
 */
export function bhPadClear(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof runArgsSchema>, ToolResult> {
  return padTool({
    name: TOOL_NAMES.PAD_CLEAR,
    title: 'Scratchpad Clear',
    description: 'Clears the current run scratchpad.',
    argsSchema: runArgsSchema,
    execute: (args, runId) => result('Cleared scratchpad', summary(defaultScratchpadRepo.clear(args.runId ?? runId)))
  });
}

/**
 * 压缩 scratchpad。
 *
 * Agent 语义：按最大字符数保留最近关键信息，避免长任务上下文膨胀。会改变本地 pad，
 * 不改页面、不触发 approval。
 */
export function bhPadCompact(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof compactArgsSchema>, ToolResult> {
  return padTool({
    name: TOOL_NAMES.PAD_COMPACT,
    title: 'Scratchpad Compact',
    description: 'Compacts the current run scratchpad.',
    argsSchema: compactArgsSchema,
    execute: (args, runId) => {
      const entry = defaultScratchpadRepo.read(args.runId ?? runId);
      const maxChars = args.maxChars ?? 1200;
      const compacted = entry.content.length > maxChars
        ? entry.content.slice(-maxChars)
        : entry.content;
      return result('Compacted scratchpad', summary(defaultScratchpadRepo.replace(entry.runId, compacted)));
    }
  });
}

function padTool<TArgs>(input: {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  readOnly?: boolean | undefined;
  execute: (args: TArgs, runId: string) => ToolResult;
}): ToolSpec<TArgs, ToolResult> {
  return {
    name: input.name,
    title: input.title,
    description: input.description,
    modes: ['memory'],
    risk: 'safe',
    argsSchema: input.argsSchema,
    resultSchema: toolResultSchema,
    readOnly: input.readOnly ?? false,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: (args, ctx) => Promise.resolve(input.execute(args, ctx.runId))
  };
}

function summary(entry: { runId: string; content: string }) {
  return scratchpadSummarySchema.parse({
    runId: entry.runId,
    content: entry.content,
    charCount: entry.content.length
  });
}

function result(message: string, data: unknown): ToolResult {
  return {
    ok: true,
    code: ERROR_CODES.OK,
    summary: message,
    data,
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary: message
    }
  };
}
