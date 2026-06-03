import type { RuntimeEvent, ExecuteToolInput, RunSnapshot } from '../../../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../../../shared/schemas/tool-result.schema';
import type { ToolRouter } from '../../../../../../tools/core/tool-router';
import type { RunMode } from '../../../../../../shared/schemas/tool.schema';
import { TRACE_EVENT_NAMES } from '../../../../../../shared/constants/event-names';
import { ERROR_CODES } from '../../../../../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../../../shared/constants/tool-names';
import { TOOL_MANIFEST_MODULES_HASH } from '../../../../../../tools/tool-manifest';
import {
  defaultWorkflowRepo,
  evaluateWorkflowCompletionEvidence,
  evaluateWorkflowPreconditions,
  type WorkflowPreviewContext
} from '../../../../../../storage/workflow-repo';
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

    const preconditionFailures = evaluateWorkflowPreconditions(
      workflow,
      workflowContextFromSnapshot(this.deps.getSnapshot(input.runId))
    );
    if (preconditionFailures.length > 0) {
      defaultWorkflowRepo.score(workflow.id, 'failed');
      return this.finish(
        input,
        failedResult(
          ERROR_CODES.WORKFLOW_PRECONDITION_FAILED,
          `Workflow replay preconditions failed: ${preconditionFailures.join(', ')}`
        ),
        record
      );
    }

    const router = this.deps.createToolRouter(record.tabId);
    for (const [index, step] of workflow.steps.entries()) {
      if (isReplayControlTool(step.tool)) {
        return this.finish(input, failedResult(ERROR_CODES.TOOL_EXECUTION_FAILED, `Workflow replay step ${index + 1} cannot execute replay control tool ${step.tool}`), record);
      }
      const args = replayArgs(step.args ?? step.argsPreview);
      const contract = router.getToolContract(step.tool, record.mode);
      if (!contract) {
        return this.finish(input, failedResult(ERROR_CODES.TOOL_EXECUTION_FAILED, `Workflow replay step ${index + 1} is not available in ${record.mode} mode: ${step.tool}`), record);
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

    const missingEvidence = evaluateWorkflowCompletionEvidence(
      workflow,
      workflowContextFromSnapshot(this.deps.getSnapshot(input.runId))
    );
    if (missingEvidence.length > 0) {
      defaultWorkflowRepo.score(workflow.id, 'failed');
      return this.finish(
        input,
        failedResult(
          ERROR_CODES.WORKFLOW_POSTCONDITION_FAILED,
          `Workflow replay postconditions failed: ${missingEvidence.join(', ')}`
        ),
        record
      );
    }

    defaultWorkflowRepo.score(workflow.id, 'success');
    if (record) {
      this.deps.appendTrace(record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_SCORE,
          ok: true,
          code: ERROR_CODES.OK,
          summary: `Workflow replay scored success: ${workflow.intent}`,
          changedPage: false,
          requiresObserve: false
        }
      });
    }
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

function failedResult(code: string, message: string): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    changedPage: false,
    requiresObserve: false,
    error: { message }
  };
}

function workflowContextFromSnapshot(snapshot: RunSnapshot): WorkflowPreviewContext {
  const observation = snapshot.observation;
  const structuredObservation = snapshot.structuredPageData?.observation.items[0];
  const refs = snapshot.refs ?? snapshot.structuredPageData?.refs.items ?? [];
  return {
    domain: observation?.currentDomain ?? structuredObservation?.currentDomain,
    origin: observation?.origin ?? structuredObservation?.origin,
    url: observation?.url ?? structuredObservation?.url,
    title: observation?.title ?? structuredObservation?.title,
    visibleTextSummary: observation?.visibleTextSummary ?? structuredObservation?.visibleTextSummary,
    pageStateSummary: observation?.pageStateSummary ?? structuredObservation?.pageStateSummary,
    refs: refs.map((ref) => ({
      refId: ref.refId,
      role: ref.role,
      name: ref.name,
      tagName: ref.tagName
    })),
    toolManifestHash: TOOL_MANIFEST_MODULES_HASH,
    adapter: snapshot.domainAdapter?.enabled
      ? {
          id: snapshot.domainAdapter.id,
          ...(snapshot.domainAdapter.version ? { version: snapshot.domainAdapter.version } : {})
        }
      : undefined
  };
}
