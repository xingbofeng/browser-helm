import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { workflowMemorySchema, workflowReplayPreviewSchema, workflowStepSchema } from '../../shared/schemas/workflow';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { defaultWorkflowRepo } from '../../storage/workflow-repo';
import { approvalRequiredResult } from '../core/tool-result-factory';
import type { ToolSpec } from '../core/tool-spec';

const lookupArgsSchema = z.object({
  domain: z.string().min(1),
  query: z.string().optional(),
  limit: z.number().int().positive().max(20).optional()
});

const saveArgsSchema = z.object({
  domain: z.string().min(1),
  origin: z.string().optional(),
  intent: z.string().min(1),
  taskDescription: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1)
});

const updateArgsSchema = z.object({
  id: z.string().min(1),
  intent: z.string().min(1).optional(),
  taskDescription: z.string().min(1).optional(),
  steps: z.array(workflowStepSchema).min(1).optional(),
  successCount: z.number().int().nonnegative().optional(),
  failureCount: z.number().int().nonnegative().optional()
});

const idArgsSchema = z.object({ id: z.string().min(1) });
const stepArgsSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative()
});
const scoreArgsSchema = z.object({
  id: z.string().min(1),
  outcome: z.enum(['success', 'failed'])
});

/**
 * 查询当前 domain 的 workflow memory。
 *
 * Agent 语义：在重复任务开始前查找可复用流程。只读、安全、不改页面、不触发 approval。
 * 参数包含 domain、可选 query/limit；返回 workflow 列表。
 */
export function bhFlowLookup(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof lookupArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_LOOKUP,
    title: 'Workflow Lookup',
    description: 'Looks up reusable local workflows for a domain.',
    argsSchema: lookupArgsSchema,
    readOnly: true,
    execute: (args) => ok('Listed workflow hits', { workflows: defaultWorkflowRepo.lookup(args) })
  });
}

/**
 * 生成 workflow replay preview。
 *
 * Agent 语义：在 replay 前展示将执行的步骤、风险和审批要求。只读、安全、不改页面；
 * 不直接执行 workflow。找不到 workflow 时返回错误。
 */
export function bhFlowPreview(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof idArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_PREVIEW,
    title: 'Workflow Preview',
    description: 'Builds a replay preview for a workflow.',
    argsSchema: idArgsSchema,
    readOnly: true,
    execute: ({ id }) => {
      const preview = defaultWorkflowRepo.preview(id);
      return preview
        ? ok('Prepared workflow replay preview', { preview: workflowReplayPreviewSchema.parse(preview) })
        : notFound('Workflow not found');
    }
  });
}

/**
 * 请求用户批准 workflow replay。
 *
 * Agent 语义：高风险和低风险 replay 都必须显式 preview + approval，不能静默执行。
 * 本工具只创建审批边界，不执行页面动作；approval 通过后由 runtime runner 逐步执行。
 */
export function bhFlowRunWithApproval(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof idArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
    title: 'Workflow Run With Approval',
    description: 'Requests approval before workflow replay.',
    argsSchema: idArgsSchema,
    risk: 'high',
    readOnly: true,
    requiresApproval: true,
    execute: ({ id }) => {
      const preview = defaultWorkflowRepo.preview(id);
      if (!preview) return notFound('Workflow not found');
      return {
        ...approvalRequiredResult({
          reason: `Confirm workflow replay: ${preview.intent}`,
          risk: preview.highRisk ? 'high' : 'medium',
          actionPreview: preview.steps.map((step, index) => `${index + 1}. ${step.summary}`).join('\n')
        }),
        data: {
          preview
        }
      };
    }
  });
}

/**
 * 返回 workflow 的下一步 replay step。
 *
 * Agent 语义：runtime runner 使用该工具按步骤推进 replay。当前版本只输出步骤摘要，
 * 不绕过 ToolRouter 执行真实页面工具；页面动作仍由 runner/approval 边界控制。
 */
export function bhFlowStep(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof stepArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_STEP,
    title: 'Workflow Step',
    description: 'Reads one replay step from a workflow.',
    argsSchema: stepArgsSchema,
    readOnly: true,
    execute: ({ id, index }) => {
      const workflow = defaultWorkflowRepo.get(id);
      const step = workflow?.steps[index];
      return step ? ok('Read workflow step', { step, index }) : notFound('Workflow step not found');
    }
  });
}

/**
 * 停止 workflow replay。
 *
 * Agent 语义：用户或 runtime 可显式停止 replay。当前工具记录停止结果，不改页面、不触发 approval。
 */
export function bhFlowStop(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof idArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_STOP,
    title: 'Workflow Stop',
    description: 'Stops a workflow replay session.',
    argsSchema: idArgsSchema,
    execute: ({ id }) => ok('Stopped workflow replay', { workflowId: id, stopped: true })
  });
}

/**
 * 保存 workflow memory。
 *
 * Agent 语义：从成功 run 或人工确认流程保存可复用 workflow。会改变本地 workflow memory，
 * 不改页面、不触发 approval；步骤 argsPreview 会脱敏。
 */
export function bhFlowSave(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof saveArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_SAVE,
    title: 'Workflow Save',
    description: 'Saves a reusable local workflow.',
    argsSchema: saveArgsSchema,
    execute: (args) => {
      const workflow = workflowMemorySchema.parse(defaultWorkflowRepo.save(args));
      return ok('Saved workflow', { workflow });
    }
  });
}

/**
 * 更新 workflow memory。
 *
 * Agent 语义：修正 workflow 描述、步骤或评分。会改变本地 workflow memory，
 * 不改页面、不触发 approval。
 */
export function bhFlowUpdate(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof updateArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_UPDATE,
    title: 'Workflow Update',
    description: 'Updates a reusable workflow.',
    argsSchema: updateArgsSchema,
    execute: ({ id, intent, taskDescription, steps, successCount, failureCount }) => {
      const patch: Parameters<typeof defaultWorkflowRepo.update>[1] = {};
      if (intent !== undefined) patch.intent = intent;
      if (taskDescription !== undefined) patch.taskDescription = taskDescription;
      if (steps !== undefined) patch.steps = steps;
      if (successCount !== undefined) patch.successCount = successCount;
      if (failureCount !== undefined) patch.failureCount = failureCount;
      const workflow = defaultWorkflowRepo.update(id, patch);
      return workflow ? ok('Updated workflow', { workflow }) : notFound('Workflow not found');
    }
  });
}

/**
 * 删除 workflow memory。
 *
 * Agent 语义：删除错误或过期 workflow。会改变本地 workflow memory，不改页面、不触发 approval。
 */
export function bhFlowDelete(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof idArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_DELETE,
    title: 'Workflow Delete',
    description: 'Deletes one workflow.',
    argsSchema: idArgsSchema,
    execute: ({ id }) => ok('Deleted workflow', { deleted: defaultWorkflowRepo.delete(id) })
  });
}

/**
 * 记录 workflow replay 成功或失败。
 *
 * Agent 语义：runner 在 replay 后更新 success/failure 计数。会改变本地 workflow memory，
 * 不改页面、不触发 approval。
 */
export function bhFlowScore(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof scoreArgsSchema>, ToolResult> {
  return flowTool({
    name: TOOL_NAMES.FLOW_SCORE,
    title: 'Workflow Score',
    description: 'Scores a workflow replay outcome.',
    argsSchema: scoreArgsSchema,
    execute: ({ id, outcome }) => {
      const workflow = defaultWorkflowRepo.score(id, outcome);
      return workflow ? ok('Scored workflow', { workflow }) : notFound('Workflow not found');
    }
  });
}

function flowTool<TArgs>(input: {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  risk?: 'safe' | 'low' | 'medium' | 'high' | undefined;
  readOnly?: boolean | undefined;
  requiresApproval?: boolean | undefined;
  execute: (args: TArgs) => ToolResult;
}): ToolSpec<TArgs, ToolResult> {
  return {
    name: input.name,
    title: input.title,
    description: input.description,
    modes: ['memory'],
    risk: input.risk ?? 'low',
    argsSchema: input.argsSchema,
    resultSchema: toolResultSchema,
    readOnly: input.readOnly ?? false,
    requiresApproval: input.requiresApproval ?? false,
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
