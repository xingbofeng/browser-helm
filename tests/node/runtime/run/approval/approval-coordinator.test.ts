import { describe, expect, it, vi } from 'vitest';

import { ApprovalCoordinator } from '../../../../../src/background/runtime/run/approval/approval-coordinator';
import { ApprovalManager } from '../../../../../src/runtime/approval/approval-manager';
import { ERROR_CODES } from '../../../../../src/shared/constants/error-codes';
import { APPROVAL_EVENT_NAMES } from '../../../../../src/shared/constants/event-names';
import type { ExecuteToolInput } from '../../../../../src/runtime/runtime-messages';

describe('ApprovalCoordinator', () => {
  it('creates an approval request and stores its pending action through one coordinator call', () => {
    const approvalManager = new ApprovalManager();
    const pendingAction: ExecuteToolInput = {
      runId: 'run_1',
      tool: 'bh_form_submit_with_approval',
      args: { formRefId: 'form_1' }
    };
    const setPendingAction = vi.fn();
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn(),
      setPendingAction,
      deletePendingAction: vi.fn(),
      approvedDecisionRequiresPendingAction: () => true
    });

    const result = coordinator.createRequest({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: { formRefId: 'form_1' },
      risk: 'high',
      reason: 'Needs approval',
      actionPreview: 'Submit form',
      pendingAction
    });

    expect(result.request.id).toMatch(/^apr_/);
    expect(result.request).toMatchObject({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      risk: 'high',
      reason: 'Needs approval',
      actionPreview: 'Submit form',
      status: 'pending'
    });
    expect(approvalManager.get(result.request.id)).toEqual(result.request);
    expect(setPendingAction).toHaveBeenCalledWith(result.request.id, pendingAction);
  });

  it('does not consume an approval that belongs to a different run', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_a',
      stepId: 'step_1',
      tool: 'bh_sensitive_tool',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const deletePendingAction = vi.fn();
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn(),
      deletePendingAction,
      approvedDecisionRequiresPendingAction: () => false
    });

    const result = coordinator.decide({
      runId: 'run_b',
      requestId: request.id,
      decision: 'approved',
      decidedAt: 10
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUEST_NOT_FOUND
    });
    expect(approvalManager.get(request.id)?.status).toBe('pending');
    expect(deletePendingAction).not.toHaveBeenCalled();
  });

  it('expires and deletes a side-effect approval when its pending action is missing', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const deletePendingAction = vi.fn();
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn().mockReturnValue(undefined),
      deletePendingAction,
      approvedDecisionRequiresPendingAction: () => true
    });

    const result = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved',
      decidedAt: 25
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE,
      auditEvent: {
        type: APPROVAL_EVENT_NAMES.EXPIRED,
        payload: { requestId: request.id, code: ERROR_CODES.APPROVAL_CONTEXT_STALE }
      }
    });
    expect(approvalManager.get(request.id)).toMatchObject({
      status: 'expired',
      decidedAt: 25
    });
    expect(deletePendingAction).toHaveBeenCalledWith(request.id);
  });

  it('expires and deletes a side-effect approval when the pending action is for another tool', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const pendingAction: ExecuteToolInput = {
      runId: 'run_1',
      tool: 'bh_action_click',
      args: {}
    };
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn().mockReturnValue(pendingAction),
      deletePendingAction: vi.fn(),
      approvedDecisionRequiresPendingAction: () => true
    });

    const result = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved',
      decidedAt: 30
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE
    });
    expect(approvalManager.get(request.id)?.status).toBe('expired');
  });

  it('approves a side-effect approval only when its pending action still matches', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const pendingAction: ExecuteToolInput = {
      runId: 'run_1',
      tool: 'bh_form_submit_with_approval',
      args: { formRefId: 'form_1' }
    };
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn().mockReturnValue(pendingAction),
      deletePendingAction: vi.fn(),
      approvedDecisionRequiresPendingAction: () => true
    });

    const result = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved',
      reason: 'ok',
      decidedAt: 40
    });

    expect(result).toMatchObject({
      ok: true,
      request: { status: 'approved', decidedAt: 40 },
      pendingAction,
      auditEvent: {
        type: APPROVAL_EVENT_NAMES.APPROVED,
        payload: { requestId: request.id, code: ERROR_CODES.OK }
      }
    });
    expect(approvalManager.get(request.id)?.status).toBe('approved');
  });

  it('treats a repeated identical approval decision as an idempotent no-op', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const pendingAction: ExecuteToolInput = {
      runId: 'run_1',
      tool: 'bh_form_submit_with_approval',
      args: { formRefId: 'form_1' }
    };
    const getPendingAction = vi.fn().mockReturnValue(pendingAction);
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction,
      deletePendingAction: vi.fn(),
      approvedDecisionRequiresPendingAction: () => true
    });

    const first = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved',
      decidedAt: 40
    });
    const second = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved',
      decidedAt: 41
    });

    expect(first).toMatchObject({
      ok: true,
      pendingAction
    });
    expect(second).toMatchObject({
      ok: true,
      alreadyDecided: true,
      request: { status: 'approved', decidedAt: 40 }
    });
    expect(second.ok && second.pendingAction).toBeUndefined();
    expect(getPendingAction).toHaveBeenCalledTimes(1);
  });

  it('expires a side-effect approval when the pending action generation is stale', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const pendingAction: ExecuteToolInput = {
      runId: 'run_1',
      tool: 'bh_form_submit_with_approval',
      args: { formRefId: 'form_1' }
    };
    const deletePendingAction = vi.fn();
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn().mockReturnValue(pendingAction),
      getPendingActionState: vi.fn().mockReturnValue({
        requestId: request.id,
        runId: 'run_1',
        generationId: 'run_1:old-generation',
        action: pendingAction,
        createdAt: 10,
        expiresAt: 1000
      }),
      getCurrentGenerationId: vi.fn().mockReturnValue('run_1:new-generation'),
      deletePendingAction,
      approvedDecisionRequiresPendingAction: () => true
    });

    const result = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved',
      decidedAt: 50
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE
    });
    expect(approvalManager.get(request.id)).toMatchObject({
      status: 'expired',
      decidedAt: 50
    });
    expect(deletePendingAction).toHaveBeenCalledWith(request.id);
  });

  it('expires a side-effect approval when the pending action TTL elapsed', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_storage_set_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const pendingAction: ExecuteToolInput = {
      runId: 'run_1',
      tool: 'bh_storage_set_with_approval',
      args: { area: 'local', key: 'theme', value: 'dark' }
    };
    const deletePendingAction = vi.fn();
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn().mockReturnValue(pendingAction),
      getPendingActionState: vi.fn().mockReturnValue({
        requestId: request.id,
        runId: 'run_1',
        generationId: 'run_1:generation',
        action: pendingAction,
        createdAt: 10,
        expiresAt: 49
      }),
      getCurrentGenerationId: vi.fn().mockReturnValue('run_1:generation'),
      deletePendingAction,
      approvedDecisionRequiresPendingAction: () => true
    });

    const result = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved',
      decidedAt: 50
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE
    });
    expect(approvalManager.get(request.id)?.status).toBe('expired');
    expect(deletePendingAction).toHaveBeenCalledWith(request.id);
  });

  it('does not deny an approval whose pending action belongs to an old generation', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_storage_set_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const pendingAction: ExecuteToolInput = {
      runId: 'run_1',
      tool: 'bh_storage_set_with_approval',
      args: { area: 'local', key: 'theme', value: 'dark' }
    };
    const deletePendingAction = vi.fn();
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn().mockReturnValue(pendingAction),
      getPendingActionState: vi.fn().mockReturnValue({
        requestId: request.id,
        runId: 'run_1',
        generationId: 'run_1:old-generation',
        action: pendingAction,
        createdAt: 10,
        expiresAt: 1000
      }),
      getCurrentGenerationId: vi.fn().mockReturnValue('run_1:new-generation'),
      deletePendingAction,
      approvedDecisionRequiresPendingAction: () => true
    });

    const result = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'denied',
      decidedAt: 51
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE
    });
    expect(approvalManager.get(request.id)).toMatchObject({
      status: 'expired',
      decidedAt: 51
    });
    expect(deletePendingAction).toHaveBeenCalledWith(request.id);
  });

  it('deletes pending action state when a request is denied', () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const deletePendingAction = vi.fn();
    const coordinator = new ApprovalCoordinator({
      approvalManager,
      getPendingAction: vi.fn(),
      deletePendingAction,
      approvedDecisionRequiresPendingAction: () => true
    });

    const result = coordinator.decide({
      runId: 'run_1',
      requestId: request.id,
      decision: 'denied',
      decidedAt: 50
    });

    expect(result).toMatchObject({
      ok: true,
      request: { status: 'denied', decidedAt: 50 },
      auditEvent: {
        type: APPROVAL_EVENT_NAMES.DENIED,
        payload: { requestId: request.id, code: ERROR_CODES.USER_DENIED_APPROVAL }
      }
    });
    expect(deletePendingAction).toHaveBeenCalledWith(request.id);
  });
});
