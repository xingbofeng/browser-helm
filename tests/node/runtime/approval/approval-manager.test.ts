import { describe, expect, it } from 'vitest';

import { ApprovalManager } from '../../../../src/runtime/approval/approval-manager';

describe('approval-manager', () => {
  it('stores pending approval requests', () => {
    const manager = new ApprovalManager();

    const request = manager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_iframe_click',
      argsPreview: { refId: 'frame_7:ref_200' },
      risk: 'high',
      reason: 'High-risk action'
    });

    expect(request.status).toBe('pending');
    expect(manager.get(request.id)).toEqual(request);
  });

  it('approves pending requests', () => {
    const manager = new ApprovalManager();
    const request = manager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_iframe_click',
      argsPreview: {},
      risk: 'high',
      reason: 'High-risk action'
    });

    const result = manager.decide({
      requestId: request.id,
      decision: 'approved',
      decidedAt: 1710000001000
    });

    expect(result).toMatchObject({
      ok: true,
      request: {
        status: 'approved',
        decidedAt: 1710000001000
      }
    });
    expect(manager.listAuditEvents()).toEqual([
      {
        type: 'approval_approved',
        requestId: request.id,
        runId: 'run_1',
        stepId: 'step_1',
        reason: undefined,
        timestamp: 1710000001000
      }
    ]);
  });

  it('denies pending requests', () => {
    const manager = new ApprovalManager();
    const request = manager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_iframe_click',
      argsPreview: {},
      risk: 'high',
      reason: 'High-risk action'
    });

    const result = manager.decide({
      requestId: request.id,
      decision: 'denied',
      reason: 'No',
      decidedAt: 1710000001000
    });

    expect(result).toMatchObject({
      ok: true,
      request: {
        status: 'denied',
        decidedAt: 1710000001000
      }
    });
    expect(manager.listAuditEvents()).toEqual([
      {
        type: 'approval_denied',
        requestId: request.id,
        runId: 'run_1',
        stepId: 'step_1',
        reason: 'No',
        timestamp: 1710000001000
      }
    ]);
  });

  it('expires pending requests and rejects later decisions', () => {
    const manager = new ApprovalManager();
    const request = manager.create({
      runId: 'run_1',
      stepId: 'step_1',
      tool: 'bh_iframe_click',
      argsPreview: {},
      risk: 'high',
      reason: 'High-risk action'
    });

    const expired = manager.expire(request.id, 1710000002000);
    const decided = manager.decide({
      requestId: request.id,
      decision: 'approved',
      decidedAt: 1710000003000
    });

    expect(expired).toMatchObject({
      ok: true,
      request: {
        status: 'expired',
        decidedAt: 1710000002000
      }
    });
    expect(decided).toMatchObject({
      ok: false,
      code: 'APPROVAL_REQUEST_NOT_PENDING'
    });
  });

  it('returns structured error for unknown requests', () => {
    const manager = new ApprovalManager();

    expect(
      manager.decide({
        requestId: 'apr_missing',
        decision: 'approved',
        decidedAt: 1710000001000
      })
    ).toMatchObject({
      ok: false,
      code: 'APPROVAL_REQUEST_NOT_FOUND'
    });
  });
});
