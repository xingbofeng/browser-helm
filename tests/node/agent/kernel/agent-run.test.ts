import { describe, expect, it } from 'vitest';

import { normalizeRunInput } from '../../../../src/agent/kernel/agent-run';

describe('agent-run', () => {
  it('applies default maxSteps and goal fallback', () => {
    const normalized = normalizeRunInput({
      task: 'Inspect page'
    });

    expect(normalized.maxSteps).toBe(3);
    expect(normalized.goal).toBe('Inspect page');
  });
});
