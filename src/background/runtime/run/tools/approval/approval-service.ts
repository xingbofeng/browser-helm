import type { ToolResult } from '../../../../../shared/schemas/tool-result.schema';
import type { DecideApprovalInput, RuntimeEvent, RunSnapshot } from '../../../../../runtime/runtime-messages';
import type { RunMode } from '../../../../../shared/schemas/tool.schema';
import type { ApprovalManager } from '../../../../../runtime/approval/approval-manager';
import { APPROVAL_EVENT_NAMES } from '../../../../../shared/constants/event-names';
import { snapshotToolResult } from '../../run-snapshot-assembler';
import type { ToolApprovalFlowRegistry } from './tool-approval-flow-registry';

export type ApprovalServiceDeps = {
  approvalManager: ApprovalManager;
  getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[]; skipProviderResponse?: boolean | undefined } | undefined;
  getSnapshot: (runId: string) => RunSnapshot;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  deletePendingAction: (requestId: string) => void;
  flowRegistry: ToolApprovalFlowRegistry;
};

export class ApprovalService {
  constructor(private readonly deps: ApprovalServiceDeps) {}

  async decideApproval(input: DecideApprovalInput): Promise<ToolResult> {
    const record = this.deps.getRecord(input.runId);
    const decidedAt = Date.now();
    const decision = this.deps.approvalManager.decide({
      requestId: input.requestId,
      decision: input.decision,
      reason: input.reason,
      decidedAt
    });

    if (!decision.ok) {
      return { ok: false, code: decision.code, summary: decision.message, error: { message: decision.message } };
    }

    const flow = this.deps.flowRegistry.getFlow(decision.request.tool);

    if (input.decision === 'denied') {
      this.deps.deletePendingAction(input.requestId);
      const result = flow.onDenied({ runId: input.runId, requestId: input.requestId, tool: decision.request.tool });
      if (record) {
        this.deps.appendTrace(record, {
          runId: input.runId, type: APPROVAL_EVENT_NAMES.DENIED,
          payload: { requestId: input.requestId, reason: input.reason ?? result.summary, code: result.code }
        });
      }
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
      if (record) {
        this.deps.appendTrace(record, {
          runId: input.runId,
          type: APPROVAL_EVENT_NAMES.APPROVED,
          payload: {
            requestId: input.requestId,
            reason: result.summary,
            code: result.code
          }
        });
      }
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
