import { describe, expect, it } from 'vitest';

import { RiskClassifier } from '../../../../src/agent/policy/RiskClassifier';

describe('RiskClassifier', () => {
  it('marks high risk as approval-required', () => {
    const classifier = new RiskClassifier();
    expect(classifier.requiresApproval('high')).toBe(true);
  });

  it('marks safe/low/medium as not approval-required by default', () => {
    const classifier = new RiskClassifier();
    expect(classifier.requiresApproval('safe')).toBe(false);
    expect(classifier.requiresApproval('low')).toBe(false);
    expect(classifier.requiresApproval('medium')).toBe(false);
  });
});
