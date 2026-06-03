import { describe, expect, it, vi } from 'vitest';

import { ApprovalService } from '../../../../src/background/runtime/run/tools/approval/approval-service';
import { ApprovalManager } from '../../../../src/runtime/approval/approval-manager';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { APPROVAL_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import type { ToolApprovalFlowRegistry } from '../../../../src/background/runtime/run/tools/approval/tool-approval-flow-registry';
import type { ToolApprovalFlow } from '../../../../src/background/runtime/run/tools/approval/flows/tool-approval-flow';
import { InMemoryRunSessionPersistence, RUN_SESSION_PENDING_TTL_MS } from '../../../../src/background/runtime/run/session-persistence';

describe('ApprovalService', () => {
  it('does not consume or execute approvals for a different run', async () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_a',
      stepId: 'step_1',
      tool: 'bh_sensitive_tool',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const onApproved = vi.fn(async () => ({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'approved',
      changedPage: false,
      requiresObserve: false
    }));
    const service = new ApprovalService({
      approvalManager,
      getRecord: () => ({ task: 'other run', mode: 'act', tabId: 1, trace: [] }),
      getSnapshot: () => ({ runId: 'run_b', mode: 'act', status: 'waiting_for_approval' }),
      setSnapshot: vi.fn(),
      appendTrace: vi.fn(),
      getPendingAction: vi.fn(),
      deletePendingAction: vi.fn(),
      flowRegistry: {
        getFlow: () => ({
          onApproved,
          onDenied: vi.fn()
        } as unknown as ToolApprovalFlow)
      } as unknown as ToolApprovalFlowRegistry
    });

    const result = await service.decideApproval({
      runId: 'run_b',
      requestId: request.id,
      decision: 'approved'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUEST_NOT_FOUND,
      changedPage: false
    });
    expect(approvalManager.get(request.id)?.status).toBe('pending');
    expect(onApproved).not.toHaveBeenCalled();
  });

  it('fails closed when approving a side-effect flow without a pending action', async () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_form_submit_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const onApproved = vi.fn(async () => ({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'approved',
      changedPage: true,
      requiresObserve: false
    }));
    const deletePendingAction = vi.fn();
    const service = new ApprovalService({
      approvalManager,
      getRecord: () => ({ task: 'submit form', mode: 'form', tabId: 1, trace: [] }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'form', status: 'waiting_for_approval' }),
      setSnapshot: vi.fn(),
      appendTrace: vi.fn(),
      deletePendingAction,
      getPendingAction: vi.fn().mockReturnValue(undefined),
      flowRegistry: {
        getFlow: () => ({
          handlesApprovedSideEffects: true,
          onApproved,
          onDenied: vi.fn()
        } as unknown as ToolApprovalFlow)
      } as unknown as ToolApprovalFlowRegistry
    });

    const result = await service.decideApproval({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE,
      changedPage: false
    });
    expect(onApproved).not.toHaveBeenCalled();
    expect(deletePendingAction).toHaveBeenCalledWith(request.id);
  });

  it('does not execute side effects twice when the same approval is submitted twice', async () => {
    const approvalManager = new ApprovalManager();
    const request = approvalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_storage_set_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    const onApproved = vi.fn(async () => ({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'approved storage mutation',
      changedPage: false,
      requiresObserve: false
    }));
    const appendTrace = vi.fn();
    const service = new ApprovalService({
      approvalManager,
      getRecord: () => ({ task: 'set storage', mode: 'debug', tabId: 1, trace: [] }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'debug', status: 'waiting_for_approval' }),
      setSnapshot: vi.fn(),
      appendTrace,
      deletePendingAction: vi.fn(),
      getPendingAction: vi.fn().mockReturnValue({
        runId: 'run_1',
        tool: 'bh_storage_set_with_approval',
        args: { area: 'local', key: 'theme', value: 'dark' }
      }),
      flowRegistry: {
        getFlow: () => ({
          handlesApprovedSideEffects: true,
          onApproved,
          onDenied: vi.fn()
        } as unknown as ToolApprovalFlow)
      } as unknown as ToolApprovalFlowRegistry
    });

    const first = await service.decideApproval({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved'
    });
    const second = await service.decideApproval({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved'
    });

    expect(first).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'approved storage mutation'
    });
    expect(second).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: false
    });
    expect(second.summary).toContain('already approved');
    expect(onApproved).toHaveBeenCalledTimes(1);
    expect(appendTrace).toHaveBeenCalledTimes(1);
    const auditEvent = appendTrace.mock.calls[0]?.[1] as RuntimeEvent | undefined;
    expect(auditEvent).toMatchObject({
      type: APPROVAL_EVENT_NAMES.APPROVED,
      payload: {
        requestId: request.id,
        code: ERROR_CODES.OK
      }
    });
  });

  it('recovers a pending approval request from session persistence after manager memory reset', async () => {
    const persistence = new InMemoryRunSessionPersistence();
    const generationId = 'run_1:generation';
    const originalManager = new ApprovalManager({
      approvalPersistence: persistence,
      getRunGenerationId: () => generationId
    });
    const request = originalManager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_storage_set_with_approval',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs approval'
    });
    persistence.persistPendingAction({
      requestId: request.id,
      runId: 'run_1',
      generationId,
      action: {
        runId: 'run_1',
        tool: 'bh_storage_set_with_approval',
        args: { area: 'local', key: 'theme', value: 'dark' }
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + RUN_SESSION_PENDING_TTL_MS
    });
    const recoveredManager = new ApprovalManager({
      approvalPersistence: persistence,
      getRunGenerationId: () => generationId
    });
    const onApproved = vi.fn(async () => ({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'approved after restart',
      changedPage: false,
      requiresObserve: false
    }));
    const service = new ApprovalService({
      approvalManager: recoveredManager,
      getRecord: () => ({ task: 'set storage', mode: 'debug', tabId: 1, trace: [] }),
      getSnapshot: () => ({ runId: 'run_1', mode: 'debug', status: 'waiting_for_approval' }),
      setSnapshot: vi.fn(),
      appendTrace: vi.fn(),
      deletePendingAction: (requestId) => persistence.deletePendingAction(requestId),
      getPendingAction: (requestId) => persistence.readPendingAction(requestId, Date.now())?.action,
      getPendingActionState: (requestId, now) => persistence.readPendingAction(requestId, now),
      getCurrentGenerationId: () => generationId,
      flowRegistry: {
        getFlow: () => ({
          handlesApprovedSideEffects: true,
          onApproved,
          onDenied: vi.fn()
        } as unknown as ToolApprovalFlow)
      } as unknown as ToolApprovalFlowRegistry
    });

    const result = await service.decideApproval({
      runId: 'run_1',
      requestId: request.id,
      decision: 'approved'
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'approved after restart'
    });
    expect(onApproved).toHaveBeenCalledTimes(1);
  });
});
