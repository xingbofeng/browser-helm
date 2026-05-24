import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONTEXT_POLICY,
  type ContextPolicy
} from '../../../../src/agent/context/context-policy';

describe('context-policy', () => {
  it('uses v0.1 defaults', () => {
    expect(DEFAULT_CONTEXT_POLICY).toEqual({
      maxRecentSteps: 3,
      maxToolResultChars: 1200,
      maxTotalContextChars: 8000
    });
  });

  it('accepts custom policy values', () => {
    const policy: ContextPolicy = {
      maxRecentSteps: 5,
      maxToolResultChars: 2000,
      maxTotalContextChars: 10000
    };

    expect(policy.maxRecentSteps).toBe(5);
  });
});
