import { describe, expect, it } from 'vitest';

import { normalizeVisionObservation } from '../../../../src/tools/vision/vision-result-normalizer';

describe('normalizeVisionObservation', () => {
  it('bounds visual text, blockers, and layout issues while preserving fallback reason', () => {
    const normalized = normalizeVisionObservation({
      summary: '视觉检查发现遮挡',
      visibleText: Array.from({ length: 20 }, (_, index) => `text-${index}`),
      blockers: ['overlay', 'modal'],
      layoutIssues: ['button shifted'],
      fallback: 'none',
      confidence: 2
    });

    expect(normalized.visibleText).toHaveLength(12);
    expect(normalized.blockers).toEqual(['overlay', 'modal']);
    expect(normalized.layoutIssues).toEqual(['button shifted']);
    expect(normalized.confidence).toBe(1);
  });
});
