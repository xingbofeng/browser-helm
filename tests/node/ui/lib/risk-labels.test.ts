import { describe, expect, it } from 'vitest';

import { riskLabels } from '../../../../src/ui/lib/risk-labels';

describe('riskLabels', () => {
  it('defines user-facing labels for every tool risk level', () => {
    expect(riskLabels).toEqual({
      safe: '安全',
      low: '低风险',
      medium: '中风险',
      high: '高风险'
    });
  });
});
