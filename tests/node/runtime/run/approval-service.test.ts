import { describe, expect, it, vi } from 'vitest';

import { ApprovalService } from '../../../../src/background/runtime/run/tools/approval/approval-service';
import { ApprovalManager } from '../../../../src/runtime/approval/approval-manager';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import type { ToolApprovalFlowRegistry } from '../../../../src/background/runtime/run/tools/approval/tool-approval-flow-registry';
import type { ToolApprovalFlow } from '../../../../src/background/runtime/run/tools/approval/flows/tool-approval-flow';

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
});
