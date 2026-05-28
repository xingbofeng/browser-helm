import { describe, expect, it } from 'vitest';

import { PolicyEngine } from '../../../../src/agent/policy/policy-engine';

describe('policy-engine', () => {
  it('allows low and medium risk actions without approval by default', () => {
    const policy = new PolicyEngine();

    expect(policy.evaluate({ risk: 'low', wouldRequireApproval: false })).toEqual({
      allow: true,
      requiresApproval: false,
      reason: '策略允许此动作'
    });
    expect(policy.evaluate({ risk: 'medium', wouldRequireApproval: false })).toEqual({
      allow: true,
      requiresApproval: false,
      reason: '策略允许此动作'
    });
  });

  it('requires approval for high risk actions', () => {
    const policy = new PolicyEngine();

    expect(policy.evaluate({ risk: 'high', wouldRequireApproval: false }))
      .toMatchObject({
        allow: false,
        requiresApproval: true,
        reason: '根据策略需要审批方可执行；动作未执行'
      });
  });

  it('lets runtime approval prediction override model supplied intent', () => {
    const policy = new PolicyEngine();

    expect(
      policy.evaluate({
        risk: 'medium',
        wouldRequireApproval: true,
        modelRequestedNoApproval: true
      })
    ).toMatchObject({
      allow: false,
      requiresApproval: true
    });
  });
});
