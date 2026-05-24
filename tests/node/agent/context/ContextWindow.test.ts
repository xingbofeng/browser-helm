import { describe, expect, it } from 'vitest';

import { ContextWindow } from '../../../../src/agent/context/ContextWindow';

describe('ContextWindow', () => {
  it('trims message content to maxTotalContextChars', () => {
    const window = new ContextWindow({
      maxRecentSteps: 3,
      maxToolResultChars: 1200,
      maxTotalContextChars: 40
    });

    const adjusted = window.enforce('01234567890123456789012345678901234567890');

    expect(adjusted.length).toBeLessThanOrEqual(40);
  });
});
