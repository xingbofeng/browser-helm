import type {
  ApprovalDecision,
  ApprovalRequest
} from '../../shared/schemas/approval.schema';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { APPROVAL_EVENT_NAMES } from '../../shared/constants/event-names';
import type { ToolRisk } from '../../shared/schemas/tool-result.schema';

const APPROVAL_REQUEST_TTL_MS = 10 * 60 * 1000;

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
      code:
        | typeof ERROR_CODES.APPROVAL_REQUEST_NOT_FOUND
        | typeof ERROR_CODES.APPROVAL_REQUEST_NOT_PENDING;
      message: string;
    };

type ApprovalAuditEvent = {
  type: (typeof APPROVAL_EVENT_NAMES)[keyof typeof APPROVAL_EVENT_NAMES];
  requestId: string;
  runId: string;
  stepId: string;
  reason?: string | undefined;
  timestamp: number;
};

type PersistedApprovalRequestLike = {
  requestId: string;
  runId: string;
  generationId: string;
  request: ApprovalRequest;
  createdAt: number;
  expiresAt: number;
};

type ApprovalRequestPersistence = {
  persistApprovalRequest(request: PersistedApprovalRequestLike): void;
  readApprovalRequest(requestId: string, now: number): PersistedApprovalRequestLike | undefined;
};

type ApprovalManagerOptions = {
  approvalPersistence?: ApprovalRequestPersistence | undefined;
  getRunGenerationId?: ((runId: string) => string | undefined) | undefined;
  approvalRequestTtlMs?: number | undefined;
};

export class ApprovalManager {
  private nextId = 1;
  private readonly auditEvents: ApprovalAuditEvent[] = [];
  private readonly requests = new Map<string, ApprovalRequest>();

  constructor(private readonly options: ApprovalManagerOptions = {}) {}

  create(input: CreateApprovalRequestInput): ApprovalRequest {
    const id = this.createRequestId();
    const request: ApprovalRequest = {
      id,
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
    this.requests.set(request.id, request);
    this.persistRequest(request);
    return request;
  }

  get(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId) ?? this.hydrateRequest(requestId);
  }

  listAuditEvents(): ApprovalAuditEvent[] {
    return [...this.auditEvents];
  }

  decide(decision: ApprovalDecision): ApprovalDecisionResult {
    const request = this.get(decision.requestId);
    if (!request) {
      return {
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUEST_NOT_FOUND,
        message: `Approval request not found: ${decision.requestId}`
      };
    }
    if (request.status !== 'pending') {
      return {
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUEST_NOT_PENDING,
        message: `Approval request is not pending: ${decision.requestId}`
      };
    }

    const updated: ApprovalRequest = {
      ...request,
      status: decision.decision,
      decidedAt: decision.decidedAt
    };
    this.requests.set(updated.id, updated);
    this.persistRequest(updated, decision.decidedAt);
    this.auditEvents.push({
      type:
        decision.decision === 'approved'
          ? APPROVAL_EVENT_NAMES.APPROVED
          : APPROVAL_EVENT_NAMES.DENIED,
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
    const request = this.get(requestId);
    if (!request) {
      return {
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUEST_NOT_FOUND,
        message: `Approval request not found: ${requestId}`
      };
    }
    if (request.status !== 'pending') {
      return {
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUEST_NOT_PENDING,
        message: `Approval request is not pending: ${requestId}`
      };
    }

    const updated: ApprovalRequest = {
      ...request,
      status: 'expired',
      decidedAt
    };
    this.requests.set(updated.id, updated);
    this.persistRequest(updated, decidedAt);
    this.auditEvents.push({
      type: APPROVAL_EVENT_NAMES.EXPIRED,
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

  private createRequestId(): string {
    let candidate = `apr_${this.nextId}`;
    const now = Date.now();
    while (
      this.requests.has(candidate) ||
      this.options.approvalPersistence?.readApprovalRequest(candidate, now)
    ) {
      this.nextId += 1;
      candidate = `apr_${this.nextId}`;
    }
    this.nextId += 1;
    return candidate;
  }

  private hydrateRequest(requestId: string): ApprovalRequest | undefined {
    const persisted = this.options.approvalPersistence?.readApprovalRequest(requestId, Date.now());
    if (!persisted) {
      return undefined;
    }
    const currentGeneration = this.options.getRunGenerationId?.(persisted.runId);
    if (currentGeneration && currentGeneration !== persisted.generationId) {
      return undefined;
    }
    this.requests.set(persisted.request.id, persisted.request);
    return persisted.request;
  }

  private persistRequest(request: ApprovalRequest, now = Date.now()): void {
    const generationId = this.options.getRunGenerationId?.(request.runId);
    if (!generationId) {
      return;
    }
    this.options.approvalPersistence?.persistApprovalRequest({
      requestId: request.id,
      runId: request.runId,
      generationId,
      request,
      createdAt: request.createdAt,
      expiresAt: now + (this.options.approvalRequestTtlMs ?? APPROVAL_REQUEST_TTL_MS)
    });
  }
}
