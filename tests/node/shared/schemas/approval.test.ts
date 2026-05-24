import { describe, expect, it } from 'vitest';

import { approvalRequestSchema } from '../../../../src/shared/schemas/approval.schema';

describe('approvalRequestSchema', () => {
  it('accepts pending approval request', () => {
    const result = approvalRequestSchema.parse({
      id: 'apr_1',
      runId: 'run_1',
      stepId: 'step_3',
      tool: 'bh_mock_submit',
      argsPreview: {
        ref: 'el_12'
      },
      risk: 'high',
      reason: 'Submission may change external state',
      actionPreview: 'Submit checkout form',
      status: 'pending',
      createdAt: 1710000000000
    });

    expect(result.status).toBe('pending');
    expect(result.risk).toBe('high');
  });

  it('accepts decided request with decidedAt', () => {
    const result = approvalRequestSchema.parse({
      id: 'apr_2',
      runId: 'run_1',
      stepId: 'step_4',
      tool: 'bh_mock_submit',
      argsPreview: {},
      risk: 'high',
      reason: 'Needs confirmation',
      status: 'denied',
      createdAt: 1710000000000,
      decidedAt: 1710000001000
    });

    expect(result.status).toBe('denied');
    expect(result.decidedAt).toBe(1710000001000);
  });

  it('rejects unknown status', () => {
    expect(() =>
      approvalRequestSchema.parse({
        id: 'apr_3',
        runId: 'run_1',
        stepId: 'step_5',
        tool: 'bh_mock_submit',
        argsPreview: {},
        risk: 'high',
        reason: 'Needs confirmation',
        status: 'waiting',
        createdAt: 1710000000000
      })
    ).toThrowError();
  });
});
