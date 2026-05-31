import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { memoryEntrySchema, memoryHitSchema } from '../../shared/schemas/memory';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { defaultMemoryRepo } from '../../storage/memory-repo';
import type { ToolSpec } from '../core/tool-spec';

const lookupArgsSchema = z.object({
  domain: z.string().min(1),
  query: z.string().optional(),
  limit: z.number().int().positive().max(20).optional()
});

const saveArgsSchema = z.object({
  domain: z.string().min(1),
  origin: z.string().optional(),
  kind: z.enum(['domain_fact', 'preference', 'workflow_hint']).optional(),
  task: z.string().min(1),
  summary: z.string().min(1),
  sourceRunId: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const updateArgsSchema = z.object({
  id: z.string().min(1),
  task: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  successCount: z.number().int().nonnegative().optional(),
  failureCount: z.number().int().nonnegative().optional()
});

const idArgsSchema = z.object({ id: z.string().min(1) });
const listArgsSchema = z.object({ domain: z.string().min(1).optional() });
const clearDomainArgsSchema = z.object({ domain: z.string().min(1) });
const emptyArgsSchema = z.object({});

/**
 * 查询当前 domain 的可复用记忆摘要。
 *
 * Agent 语义：在 Ask/Act/Form/Debug/Full 中读取本地 domain memory，用于判断是否有相似成功经验。
 * 只读、安全、不会修改页面，不触发 approval。参数为 domain、可选 query 和 limit；返回命中列表及分数。
 */
export function bhMemoryLookup(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof lookupArgsSchema>, ToolResult> {
  return memoryTool({
    name: TOOL_NAMES.MEMORY_LOOKUP,
    title: 'Memory Lookup',
    description: 'Looks up local domain memory hits.',
    argsSchema: lookupArgsSchema,
    execute: (args) => {
      const hits = defaultMemoryRepo.lookup(args).map((hit) => memoryHitSchema.parse(hit));
      return ok(`Found ${hits.length} memory hit(s)`, { hits });
    }
  });
}

/**
 * 保存一条脱敏后的 domain memory。
 *
 * Agent 语义：把已验证的事实、偏好或 workflow hint 写入本地记忆。会改变本地 memory，
 * 不改变页面状态；风险低，不触发 approval。参数包含 domain、task、summary 和可选标签。
 */
export function bhMemorySave(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof saveArgsSchema>, ToolResult> {
  return memoryTool({
    name: TOOL_NAMES.MEMORY_SAVE,
    title: 'Memory Save',
    description: 'Saves a redacted local domain memory.',
    argsSchema: saveArgsSchema,
    execute: (args) => {
      const entry = memoryEntrySchema.parse(defaultMemoryRepo.save(args));
      return ok('Saved memory', { entry });
    }
  });
}

/**
 * 更新一条本地 memory。
 *
 * Agent 语义：修正 summary、tags 或成功/失败计数。会改变本地 memory，不改页面；
 * 风险低，不触发 approval。找不到 id 时返回明确错误。
 */
export function bhMemoryUpdate(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof updateArgsSchema>, ToolResult> {
  return memoryTool({
    name: TOOL_NAMES.MEMORY_UPDATE,
    title: 'Memory Update',
    description: 'Updates a local memory entry.',
    argsSchema: updateArgsSchema,
    execute: ({ id, task, summary, tags, successCount, failureCount }) => {
      const patch: Parameters<typeof defaultMemoryRepo.update>[1] = {};
      if (task !== undefined) patch.task = task;
      if (summary !== undefined) patch.summary = summary;
      if (tags !== undefined) patch.tags = tags;
      if (successCount !== undefined) patch.successCount = successCount;
      if (failureCount !== undefined) patch.failureCount = failureCount;
      const entry = defaultMemoryRepo.update(id, patch);
      return entry ? ok('Updated memory', { entry }) : notFound('Memory not found');
    }
  });
}

/**
 * 删除一条本地 memory。
 *
 * Agent 语义：按 id 删除错误或过期记忆。会改变本地 memory，不改页面；
 * 风险低，不触发 approval。返回 deleted 布尔值。
 */
export function bhMemoryDelete(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof idArgsSchema>, ToolResult> {
  return memoryTool({
    name: TOOL_NAMES.MEMORY_DELETE,
    title: 'Memory Delete',
    description: 'Deletes one local memory entry.',
    argsSchema: idArgsSchema,
    execute: ({ id }) => ok('Deleted memory', { deleted: defaultMemoryRepo.delete(id) })
  });
}

/**
 * 列出本地 memory。
 *
 * Agent 语义：给 MemoryViewer 或 agent 提供当前 memory 清单。只读、安全、不触发 approval。
 * 可按 domain 过滤；返回 entries。
 */
export function bhMemoryList(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof listArgsSchema>, ToolResult> {
  return memoryTool({
    name: TOOL_NAMES.MEMORY_LIST,
    title: 'Memory List',
    description: 'Lists local memory entries.',
    argsSchema: listArgsSchema,
    execute: ({ domain }) => ok('Listed memory', { entries: defaultMemoryRepo.list(domain) })
  });
}

/**
 * 删除某个 domain 的全部 memory。
 *
 * Agent 语义：用户按站点清空记忆的工具。会改变本地 memory，不改页面；
 * 风险低，不触发 approval；返回删除数量。
 */
export function bhMemoryClearDomain(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof clearDomainArgsSchema>, ToolResult> {
  return memoryTool({
    name: TOOL_NAMES.MEMORY_CLEAR_DOMAIN,
    title: 'Memory Clear Domain',
    description: 'Clears all memory entries for a domain.',
    argsSchema: clearDomainArgsSchema,
    execute: ({ domain }) => ok('Cleared domain memory', { deletedCount: defaultMemoryRepo.clearDomain(domain) })
  });
}

/**
 * 清空全部本地 memory。
 *
 * Agent 语义：隐私控制或测试清理入口。会改变本地 memory，不改页面；
 * 风险低，不触发 approval；返回删除数量。
 */
export function bhMemoryClearAll(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof emptyArgsSchema>, ToolResult> {
  return memoryTool({
    name: TOOL_NAMES.MEMORY_CLEAR_ALL,
    title: 'Memory Clear All',
    description: 'Clears all local memory entries.',
    argsSchema: emptyArgsSchema,
    execute: () => ok('Cleared all memory', { deletedCount: defaultMemoryRepo.clearAll() })
  });
}

/**
 * 解释某条 memory 为什么命中。
 *
 * Agent 语义：MemoryViewer 和 replay preview 中解释来源、成功率和摘要。只读、安全、不触发 approval。
 * 参数为 memory id；返回 explanation。
 */
export function bhMemoryExplainHit(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof idArgsSchema>, ToolResult> {
  return memoryTool({
    name: TOOL_NAMES.MEMORY_EXPLAIN_HIT,
    title: 'Memory Explain Hit',
    description: 'Explains why a memory entry is relevant.',
    argsSchema: idArgsSchema,
    execute: ({ id }) => {
      const entry = defaultMemoryRepo.list().find((item) => item.id === id);
      if (!entry) return notFound('Memory not found');
      return ok('Explained memory hit', {
        explanation: `${entry.domain}: ${entry.summary}`,
        successCount: entry.successCount,
        failureCount: entry.failureCount
      });
    }
  });
}

function memoryTool<TArgs>(input: {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  execute: (args: TArgs) => ToolResult;
}): ToolSpec<TArgs, ToolResult> {
  return {
    name: input.name,
    title: input.title,
    description: input.description,
    modes: ['memory'],
    risk: 'low',
    argsSchema: input.argsSchema,
    resultSchema: toolResultSchema,
    readOnly: input.name === TOOL_NAMES.MEMORY_LOOKUP ||
      input.name === TOOL_NAMES.MEMORY_LIST ||
      input.name === TOOL_NAMES.MEMORY_EXPLAIN_HIT,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: (args) => Promise.resolve(input.execute(args))
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

function notFound(message: string): ToolResult {
  return {
    ok: false,
    code: ERROR_CODES.TOOL_NOT_FOUND,
    summary: message,
    changedPage: false,
    requiresObserve: false,
    error: { message }
  };
}
