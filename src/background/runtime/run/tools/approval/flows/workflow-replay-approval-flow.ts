import type { RuntimeEvent, ExecuteToolInput, RunSnapshot } from '../../../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../../../shared/schemas/tool-result.schema';
import type { ToolRouter } from '../../../../../../tools/core/tool-router';
import type { RunMode } from '../../../../../../shared/schemas/tool.schema';
import { APPROVAL_EVENT_NAMES } from '../../../../../../shared/constants/event-names';
import { ERROR_CODES } from '../../../../../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../../../shared/constants/tool-names';
import { defaultWorkflowRepo } from '../../../../../../storage/workflow-repo';
import { snapshotToolResult } from '../../../run-snapshot-assembler';
import type { ToolApprovalFlow } from './tool-approval-flow';

export class WorkflowReplayApprovalFlow implements ToolApprovalFlow {
  readonly handlesApprovedSideEffects = true;

  constructor(
    private readonly deps: {
      getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[] } | undefined;
      getPendingAction: (requestId: string) => ExecuteToolInput | undefined;
      deletePendingAction: (requestId: string) => void;
      createToolRouter: (tabId: number) => ToolRouter;
      executeTool: (input: ExecuteToolInput) => Promise<ToolResult>;
      appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
      setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
      getSnapshot: (runId: string) => RunSnapshot;
    }
  ) {}

  async onApproved(input: { runId: string; requestId: string; tool: string }): Promise<ToolResult> {
    const record = this.deps.getRecord(input.runId);
    const pendingAction = this.deps.getPendingAction(input.requestId);
    this.deps.deletePendingAction(input.requestId);
    if (record) {
      this.deps.appendTrace(record, {
        runId: input.runId,
        type: APPROVAL_EVENT_NAMES.APPROVED,
        payload: { requestId: input.requestId, reason: 'Workflow replay approval granted', code: ERROR_CODES.OK }
      });
    }
    if (!record?.tabId) {
      return this.finish(input, unavailableResult('Run is not available for workflow replay'), record);
    }
    const workflowId = workflowIdFromPendingAction(pendingAction) ??
      workflowIdFromPendingAction({ runId: input.runId, tool: input.tool, args: approvalArgsFromSnapshot(this.deps.getSnapshot(input.runId)) });
    if (!workflowId) {
      return this.finish(input, unavailableResult('Workflow replay request is missing workflow id'), record);
    }
    const workflow = defaultWorkflowRepo.get(workflowId);
    if (!workflow) {
      return this.finish(input, unavailableResult('Workflow not found for replay'), record);
    }

    const router = this.deps.createToolRouter(record.tabId);
    for (const [index, step] of workflow.steps.entries()) {
      if (isReplayControlTool(step.tool)) {
        return this.finish(input, failedResult(`Workflow replay step ${index + 1} cannot execute replay control tool ${step.tool}`), record);
      }
      const args = replayArgs(step.args ?? step.argsPreview);
      const contract = router.getToolContract(step.tool, record.mode);
      if (!contract) {
        return this.finish(input, failedResult(`Workflow replay step ${index + 1} is not available in ${record.mode} mode: ${step.tool}`), record);
      }
      const result = await this.deps.executeTool({
        runId: input.runId,
        tool: step.tool,
        args
      });
      if (result.requiresApproval) {
        return result;
      }
      if (!result.ok) {
        defaultWorkflowRepo.score(workflow.id, 'failed');
        return result;
      }
    }

    defaultWorkflowRepo.score(workflow.id, 'success');
    return this.finish(input, {
      ok: true,
      code: ERROR_CODES.OK,
      summary: `Workflow replay completed: ${workflow.intent}`,
      data: {
        workflowId: workflow.id,
        stepCount: workflow.steps.length
      },
      changedPage: false,
      requiresObserve: false
    }, record);
  }

  onDenied(): ToolResult {
    return {
      ok: false,
      code: ERROR_CODES.USER_DENIED_APPROVAL,
      summary: 'User denied workflow replay approval',
      changedPage: false,
      requiresObserve: false,
      error: { message: 'User denied workflow replay approval' }
    };
  }

  private finish(
    input: { runId: string; tool: string },
    result: ToolResult,
    record: { trace: RuntimeEvent[] } | undefined
  ): ToolResult {
    this.deps.setSnapshot(input.runId, {
      ...this.deps.getSnapshot(input.runId),
      status: result.ok ? 'finished' : 'error',
      pendingApproval: undefined,
      toolResult: snapshotToolResult(input.tool, result),
      trace: record?.trace ?? [],
      ...(result.ok ? {} : { error: { code: result.code, message: result.error?.message ?? result.summary } })
    });
    return result;
  }
}

function workflowIdFromPendingAction(action: ExecuteToolInput | undefined): string | undefined {
  const args = replayArgs(action?.args);
  return typeof args.id === 'string' ? args.id : undefined;
}

function approvalArgsFromSnapshot(snapshot: RunSnapshot): Record<string, unknown> {
  const detail = replayArgs(snapshot.toolResult?.detail);
  const data = replayArgs(detail.data);
  const preview = replayArgs(data.preview);
  return typeof preview.workflowId === 'string' ? { id: preview.workflowId } : {};
}

function replayArgs(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isReplayControlTool(tool: string): boolean {
  return tool === TOOL_NAMES.FLOW_RUN_WITH_APPROVAL ||
    tool === TOOL_NAMES.FLOW_PREVIEW ||
    tool === TOOL_NAMES.FLOW_STOP ||
    tool === TOOL_NAMES.FLOW_STEP;
}

function unavailableResult(message: string): ToolResult {
  return {
    ok: false,
    code: ERROR_CODES.RUNTIME_UNAVAILABLE,
    summary: message,
    changedPage: false,
    requiresObserve: false,
    error: { message }
  };
}

function failedResult(message: string): ToolResult {
  return {
    ok: false,
    code: ERROR_CODES.TOOL_EXECUTION_FAILED,
    summary: message,
    changedPage: false,
    requiresObserve: false,
    error: { message }
  };
}
