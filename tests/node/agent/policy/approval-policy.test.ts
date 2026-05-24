import { describe, expect, it } from 'vitest';

import { ApprovalPolicy } from '../../../../src/agent/policy/approval-policy';

describe('approval-policy', () => {
  it('requires approval for high-risk tool', () => {
    const policy = new ApprovalPolicy();
    const evaluation = policy.evaluate({
      risk: 'high',
      requestedByToolResult: false
    });

    expect(evaluation.requiresApproval).toBe(true);
  });

  it('requires approval when tool explicitly requests it', () => {
    const policy = new ApprovalPolicy();
    const evaluation = policy.evaluate({
      risk: 'low',
      requestedByToolResult: true
    });

    expect(evaluation.requiresApproval).toBe(true);
  });
});
