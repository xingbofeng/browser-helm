import type { ExecuteToolInput, RuntimeEvent } from '../../../../runtime/runtime-messages';
import type { ApprovalManager } from '../../../../runtime/approval/approval-manager';
import type { ApprovalRequest } from '../../../../shared/schemas/approval.schema';
import { ERROR_CODES } from '../../../../shared/constants/error-codes';
import { APPROVAL_EVENT_NAMES } from '../../../../shared/constants/event-names';

export type ApprovalCoordinatorDeps = {
  approvalManager: ApprovalManager;
  setPendingAction?: ((requestId: string, input: ExecuteToolInput) => void) | undefined;
  getPendingAction?: ((requestId: string) => ExecuteToolInput | undefined) | undefined;
  getPendingActionState?: ((requestId: string, now: number) => ApprovalPendingActionState | undefined) | undefined;
  getCurrentGenerationId?: ((runId: string) => string | undefined) | undefined;
  deletePendingAction?: ((requestId: string) => void) | undefined;
  approvedDecisionRequiresPendingAction?: ((tool: string) => boolean) | undefined;
};

export type ApprovalPendingActionState = {
  requestId: string;
  runId: string;
  generationId: string;
  action: ExecuteToolInput;
  createdAt: number;
  expiresAt: number;
};

export type ApprovalCoordinatorInput = {
  runId: string;
  requestId: string;
  decision: 'approved' | 'denied';
  reason?: string | undefined;
  decidedAt: number;
};

export type ApprovalCoordinatorCreateInput = {
  runId: string;
  stepId: string;
  tool: string;
  argsPreview: unknown;
  risk: ApprovalRequest['risk'];
  reason: string;
  actionPreview?: string | undefined;
  pendingAction: ExecuteToolInput;
};

export type ApprovalCoordinatorResult =
  | {
      ok: true;
      request: ApprovalRequest;
      pendingAction?: ExecuteToolInput | undefined;
      alreadyDecided?: true | undefined;
      auditEvent?: RuntimeEvent | undefined;
    }
  | {
      ok: false;
      code:
        | typeof ERROR_CODES.APPROVAL_REQUEST_NOT_FOUND
        | typeof ERROR_CODES.APPROVAL_REQUEST_NOT_PENDING
        | typeof ERROR_CODES.APPROVAL_CONTEXT_STALE;
      message: string;
      request?: ApprovalRequest | undefined;
      auditEvent?: RuntimeEvent | undefined;
    };

export class ApprovalCoordinator {
  constructor(private readonly deps: ApprovalCoordinatorDeps) {}

  createRequest(input: ApprovalCoordinatorCreateInput): {
    request: ApprovalRequest;
    pendingAction: ExecuteToolInput;
  } {
    if (!this.deps.setPendingAction) {
      throw new Error('ApprovalCoordinator createRequest requires setPendingAction');
    }
    const request = this.deps.approvalManager.create({
      runId: input.runId,
      stepId: input.stepId,
      tool: input.tool,
      argsPreview: input.argsPreview,
      risk: input.risk,
      reason: input.reason,
      actionPreview: input.actionPreview
    });
    this.deps.setPendingAction(request.id, input.pendingAction);
    return {
      request,
      pendingAction: input.pendingAction
    };
  }

  decide(input: ApprovalCoordinatorInput): ApprovalCoordinatorResult {
    const decisionDeps = this.decisionDeps();
    const request = this.deps.approvalManager.get(input.requestId);
    if (!request || request.runId !== input.runId) {
      return {
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUEST_NOT_FOUND,
        message: `Approval request not found for run: ${input.requestId}`
      };
    }

    if (request.status !== 'pending') {
      if (request.status === input.decision) {
        return {
          ok: true,
          request,
          alreadyDecided: true
        };
      }
      return {
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUEST_NOT_PENDING,
        message: `Approval request is not pending: ${input.requestId}`,
        request
      };
    }

    if (input.decision === 'denied' && this.deps.getPendingActionState) {
      const pendingState = this.readPendingActionState(input, request);
      if (!pendingState) {
        return this.expireStale(input, request);
      }
    }

    if (
      input.decision === 'approved'
      && decisionDeps.approvedDecisionRequiresPendingAction(request.tool)
    ) {
      const pendingAction = this.readPendingAction(input, request);
      if (!pendingAction) {
        return this.expireStale(input, request);
      }
      return this.commitDecision(input, pendingAction);
    }

    const result = this.commitDecision(input);
    if (input.decision === 'denied') {
      decisionDeps.deletePendingAction(input.requestId);
    }
    return result;
  }

  private commitDecision(
    input: ApprovalCoordinatorInput,
    pendingAction?: ExecuteToolInput
  ): ApprovalCoordinatorResult {
    const decision = this.deps.approvalManager.decide({
      requestId: input.requestId,
      decision: input.decision,
      reason: input.reason,
      decidedAt: input.decidedAt
    });

    if (!decision.ok) {
      return {
        ok: false,
        code: decision.code,
        message: decision.message
      };
    }

    return {
      ok: true,
      request: decision.request,
      pendingAction,
      auditEvent: this.auditEventForDecision(decision.request, input)
    };
  }

  private readPendingAction(
    input: ApprovalCoordinatorInput,
    request: ApprovalRequest
  ): ExecuteToolInput | undefined {
    if (this.deps.getPendingActionState) {
      return this.readPendingActionState(input, request)?.action;
    }

    const pendingAction = this.decisionDeps().getPendingAction(input.requestId);
    if (!pendingAction || pendingAction.runId !== input.runId || pendingAction.tool !== request.tool) {
      return undefined;
    }
    return pendingAction;
  }

  private readPendingActionState(
    input: ApprovalCoordinatorInput,
    request: ApprovalRequest
  ): ApprovalPendingActionState | undefined {
    const state = this.deps.getPendingActionState?.(input.requestId, input.decidedAt);
    if (!state) {
      return undefined;
    }
    if (
      state.requestId !== input.requestId ||
      state.runId !== input.runId ||
      state.action.runId !== input.runId ||
      state.action.tool !== request.tool ||
      state.expiresAt <= input.decidedAt
    ) {
      return undefined;
    }
    const currentGeneration = this.deps.getCurrentGenerationId?.(input.runId);
    if (currentGeneration && currentGeneration !== state.generationId) {
      return undefined;
    }
    return state;
  }

  private expireStale(
    input: ApprovalCoordinatorInput,
    request: ApprovalRequest
  ): ApprovalCoordinatorResult {
    this.decisionDeps().deletePendingAction(input.requestId);
    const expired = this.deps.approvalManager.expire(input.requestId, input.decidedAt);
    return {
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE,
      message: `Approval context is stale for request: ${input.requestId}`,
      request: expired.ok ? expired.request : request,
      auditEvent: this.auditEventForExpired(expired.ok ? expired.request : request, input)
    };
  }

  private auditEventForDecision(
    request: ApprovalRequest,
    input: ApprovalCoordinatorInput
  ): RuntimeEvent {
    const approved = input.decision === 'approved';
    return {
      runId: input.runId,
      type: approved ? APPROVAL_EVENT_NAMES.APPROVED : APPROVAL_EVENT_NAMES.DENIED,
      payload: {
        requestId: input.requestId,
        ...(input.reason ? { reason: input.reason } : {}),
        code: approved ? ERROR_CODES.OK : ERROR_CODES.USER_DENIED_APPROVAL,
        tool: request.tool
      }
    };
  }

  private auditEventForExpired(
    request: ApprovalRequest,
    input: ApprovalCoordinatorInput
  ): RuntimeEvent {
    return {
      runId: input.runId,
      type: APPROVAL_EVENT_NAMES.EXPIRED,
      payload: {
        requestId: input.requestId,
        reason: `Approval context is stale for request: ${input.requestId}`,
        code: ERROR_CODES.APPROVAL_CONTEXT_STALE,
        tool: request.tool
      }
    };
  }

  private decisionDeps(): {
    getPendingAction: (requestId: string) => ExecuteToolInput | undefined;
    deletePendingAction: (requestId: string) => void;
    approvedDecisionRequiresPendingAction: (tool: string) => boolean;
  } {
    if (
      !this.deps.getPendingAction ||
      !this.deps.deletePendingAction ||
      !this.deps.approvedDecisionRequiresPendingAction
    ) {
      throw new Error('ApprovalCoordinator decide requires pending action decision dependencies');
    }
    return {
      getPendingAction: this.deps.getPendingAction,
      deletePendingAction: this.deps.deletePendingAction,
      approvedDecisionRequiresPendingAction: this.deps.approvedDecisionRequiresPendingAction
    };
  }
}
