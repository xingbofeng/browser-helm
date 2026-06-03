import type { ToolResult } from '../../../../../shared/schemas/tool-result.schema';
import type { DecideApprovalInput, RuntimeEvent, RunSnapshot } from '../../../../../runtime/runtime-messages';
import type { RunMode } from '../../../../../shared/schemas/tool.schema';
import type { ApprovalManager } from '../../../../../runtime/approval/approval-manager';
import { ERROR_CODES } from '../../../../../shared/constants/error-codes';
import { snapshotToolResult } from '../../run-snapshot-assembler';
import type { ToolApprovalFlowRegistry } from './tool-approval-flow-registry';
import { ApprovalCoordinator, type ApprovalPendingActionState } from '../../approval/approval-coordinator';
import type { ExecuteToolInput } from '../../../../../runtime/runtime-messages';

export type ApprovalServiceDeps = {
  approvalManager: ApprovalManager;
  getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[] } | undefined;
  getSnapshot: (runId: string) => RunSnapshot;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  getPendingAction: (requestId: string) => ExecuteToolInput | undefined;
  getPendingActionState?: ((requestId: string, now: number) => ApprovalPendingActionState | undefined) | undefined;
  getCurrentGenerationId?: ((runId: string) => string | undefined) | undefined;
  deletePendingAction: (requestId: string) => void;
  flowRegistry: ToolApprovalFlowRegistry;
};

export class ApprovalService {
  private readonly coordinator: ApprovalCoordinator;

  constructor(private readonly deps: ApprovalServiceDeps) {
    this.coordinator = new ApprovalCoordinator({
      approvalManager: deps.approvalManager,
      getPendingAction: deps.getPendingAction,
      getPendingActionState: deps.getPendingActionState,
      getCurrentGenerationId: deps.getCurrentGenerationId,
      deletePendingAction: deps.deletePendingAction,
      approvedDecisionRequiresPendingAction: (tool) =>
        deps.flowRegistry.getFlow(tool).handlesApprovedSideEffects === true
    });
  }

  async decideApproval(input: DecideApprovalInput): Promise<ToolResult> {
    const record = this.deps.getRecord(input.runId);
    const decidedAt = Date.now();
    const decision = this.coordinator.decide({
      runId: input.runId,
      requestId: input.requestId,
      decision: input.decision,
      reason: input.reason,
      decidedAt
    });

    if (!decision.ok) {
      const result = coordinatorFailureResult(decision.code, decision.message);
      if (decision.request?.runId === input.runId) {
        if (record && decision.auditEvent) {
          this.deps.appendTrace(record, decision.auditEvent);
        }
        this.deps.setSnapshot(input.runId, {
          ...this.deps.getSnapshot(input.runId),
          status: 'failed',
          pendingApproval: undefined,
          toolResult: snapshotToolResult(decision.request.tool, result),
          trace: record?.trace ?? []
        });
      }
      return result;
    }

    if (decision.alreadyDecided) {
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Approval already ${decision.request.status}; no action executed.`,
        changedPage: false,
        requiresObserve: false
      };
    }

    const flow = this.deps.flowRegistry.getFlow(decision.request.tool);
    if (record && decision.auditEvent) {
      this.deps.appendTrace(record, decision.auditEvent);
    }

    if (input.decision === 'denied') {
      this.deps.deletePendingAction(input.requestId);
      const result = flow.onDenied({ runId: input.runId, requestId: input.requestId, tool: decision.request.tool });
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'failed', pendingApproval: undefined,
        toolResult: snapshotToolResult(decision.request.tool, result),
        trace: record?.trace ?? []
      });
      return result;
    }

    const result = await flow.onApproved({
      runId: input.runId,
      requestId: input.requestId,
      tool: decision.request.tool
    });
    if (!flow.handlesApprovedSideEffects) {
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'observed',
        pendingApproval: undefined,
        toolResult: snapshotToolResult(decision.request.tool, result),
        trace: record?.trace ?? []
      });
    }
    return result;
  }
}

function coordinatorFailureResult(code: string, message: string): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    changedPage: false,
    requiresObserve: false,
    error: { message }
  };
}
