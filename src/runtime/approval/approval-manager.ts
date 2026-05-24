import type {
  ApprovalDecision,
  ApprovalRequest
} from '../../shared/schemas/approval.schema';
import type { ToolRisk } from '../../shared/schemas/tool-result.schema';

type CreateApprovalRequestInput = {
  runId: string;
  stepId: string;
  tool: string;
  argsPreview: unknown;
  risk: ToolRisk;
  reason: string;
  actionPreview?: string | undefined;
};

type ApprovalDecisionResult =
  | {
      ok: true;
      request: ApprovalRequest;
    }
  | {
      ok: false;
      code: 'APPROVAL_REQUEST_NOT_FOUND' | 'APPROVAL_REQUEST_NOT_PENDING';
      message: string;
    };

type ApprovalAuditEvent = {
  type: 'approval_approved' | 'approval_denied' | 'approval_expired';
  requestId: string;
  runId: string;
  stepId: string;
  reason?: string | undefined;
  timestamp: number;
};

export class ApprovalManager {
  private nextId = 1;
  private readonly auditEvents: ApprovalAuditEvent[] = [];
  private readonly requests = new Map<string, ApprovalRequest>();

  create(input: CreateApprovalRequestInput): ApprovalRequest {
    const request: ApprovalRequest = {
      id: `apr_${this.nextId}`,
      runId: input.runId,
      stepId: input.stepId,
      tool: input.tool,
      argsPreview: input.argsPreview,
      risk: input.risk,
      reason: input.reason,
      ...(input.actionPreview ? { actionPreview: input.actionPreview } : {}),
      status: 'pending',
      createdAt: Date.now()
    };
    this.nextId += 1;
    this.requests.set(request.id, request);
    return request;
  }

  get(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  listAuditEvents(): ApprovalAuditEvent[] {
    return [...this.auditEvents];
  }

  decide(decision: ApprovalDecision): ApprovalDecisionResult {
    const request = this.requests.get(decision.requestId);
    if (!request) {
      return {
        ok: false,
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        message: `Approval request not found: ${decision.requestId}`
      };
    }
    if (request.status !== 'pending') {
      return {
        ok: false,
        code: 'APPROVAL_REQUEST_NOT_PENDING',
        message: `Approval request is not pending: ${decision.requestId}`
      };
    }

    const updated: ApprovalRequest = {
      ...request,
      status: decision.decision,
      decidedAt: decision.decidedAt
    };
    this.requests.set(updated.id, updated);
    this.auditEvents.push({
      type:
        decision.decision === 'approved'
          ? 'approval_approved'
          : 'approval_denied',
      requestId: updated.id,
      runId: updated.runId,
      stepId: updated.stepId,
      reason: decision.reason,
      timestamp: decision.decidedAt
    });
    return {
      ok: true,
      request: updated
    };
  }

  expire(requestId: string, decidedAt: number): ApprovalDecisionResult {
    const request = this.requests.get(requestId);
    if (!request) {
      return {
        ok: false,
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        message: `Approval request not found: ${requestId}`
      };
    }
    if (request.status !== 'pending') {
      return {
        ok: false,
        code: 'APPROVAL_REQUEST_NOT_PENDING',
        message: `Approval request is not pending: ${requestId}`
      };
    }

    const updated: ApprovalRequest = {
      ...request,
      status: 'expired',
      decidedAt
    };
    this.requests.set(updated.id, updated);
    this.auditEvents.push({
      type: 'approval_expired',
      requestId: updated.id,
      runId: updated.runId,
      stepId: updated.stepId,
      timestamp: decidedAt
    });
    return {
      ok: true,
      request: updated
    };
  }
}
