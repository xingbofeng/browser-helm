import { describe, expect, it } from 'vitest';

import { createLoopTurn } from '../../../../src/agent/kernel/agent-step';

describe('agent-step', () => {
  it('creates loop turn with optional intent', () => {
    const step = createLoopTurn({
      runId: 'run_1',
      stepIndex: 1,
      intent: 'Observe page'
    });

    expect(step.runId).toBe('run_1');
    expect(step.stepIndex).toBe(1);
    expect(step.intent).toBe('Observe page');
  });
});
